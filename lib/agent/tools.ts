import "server-only";
import { z } from "zod";
import { defineTool, type AgentTool } from "./defineTool";
import type { Profile, State, Status } from "../claimpilot/types";
import { mutate, readState } from "../claimpilot/store";
import {
  assertRole,
  calculate,
  calculateClaim,
  DomainError,
  investigate,
  requireRead,
} from "../claimpilot/engine";
import {
  addComment,
  audit,
  createClaim,
  createExpense,
  createTrip,
  redactInvestigation,
  transitionClaim,
  updateExpense,
  viewState,
} from "../claimpilot/service";
import { claimSchema, expenseSchema, tripSchema } from "../claimpilot/schemas";
import { analytics } from "../claimpilot/analytics";
const idSchema = z
  .object({
    id: z
      .string()
      .uuid()
      .describe("The actual record UUID returned by a read tool"),
  })
  .strict();
export function getTools(actor: Profile): AgentTool[] {
  const read = async () => viewState(await readState(), actor);
  async function claimDetails(id: string) {
    const s = await readState();
    const c = s.claims.find((c) => c.id === id);
    if (!c) throw new DomainError("Claim not found", 404);
    requireRead(actor, c.employeeId, s.profiles);
    const expenses = s.expenses.filter((e) => c.expenseIds.includes(e.id));
    return {
      claim: c,
      expenses,
      investigation: redactInvestigation(investigate(expenses, s), actor, s),
      calculation: calculateClaim(c, s),
    };
  }
  const tools: AgentTool[] = [
    defineTool({
      name: "getMyClaims",
      description:
        "Use this when the user asks about their claims or pending reimbursements. Values are minor units.",
      schema: z.object({}).strict(),
      run: async () =>
        (await read()).claims.filter((c) => c.employeeId === actor.id),
    }),
    defineTool({
      name: "getMyExpenses",
      description:
        "Use this when the user asks to list their expenses and draft expense IDs.",
      schema: z.object({}).strict(),
      run: async () =>
        (await read()).expenses
          .filter((e) => e.employeeId === actor.id)
          .slice(-50),
    }),
    defineTool({
      name: "getExpensePolicy",
      description:
        "Use this when explaining fictional configured company policies. Limits are minor units.",
      schema: z.object({}).strict(),
      run: async () => (await read()).policies,
    }),
    defineTool({
      name: "extractReceipt",
      description:
        "Use this to retrieve validated extraction and uncertainty for a previously uploaded owned receipt. Upload documents through Submit Claim; this tool does not invent receipt data.",
      schema: idSchema,
      run: async ({ id }) => {
        const r = (await read()).receipts.find((r) => r.id === id);
        if (!r) throw new DomainError("Receipt not found", 404);
        return r;
      },
    }),
    defineTool({
      name: "createExpense",
      description:
        "Use this when explicitly asked to create a draft expense. Amount and tax are original decimal strings, date YYYY-MM-DD. Does not submit.",
      schema: expenseSchema,
      writes: true,
      run: async (d) => mutate((s) => createExpense(s, actor, d)),
    }),
    defineTool({
      name: "updateExpense",
      description:
        "Use this when explicitly asked to correct an unclaimed draft expense. Full reviewed fields required.",
      schema: expenseSchema.extend({ id: z.string().uuid() }),
      writes: true,
      run: async ({ id, ...d }) =>
        mutate((s) => updateExpense(s, actor, id, d)),
    }),
    defineTool({
      name: "getTripDetails",
      description:
        "Use this when the user asks about accessible business trips.",
      schema: z.object({}).strict(),
      run: async () => (await read()).trips,
    }),
    defineTool({
      name: "createTrip",
      description:
        "Use this when explicitly asked to create a business trip for the authenticated actor. Dates YYYY-MM-DD.",
      schema: tripSchema,
      writes: true,
      run: async (d) => mutate((s) => createTrip(s, actor, d)),
    }),
    defineTool({
      name: "checkExpenseCompliance",
      description:
        "Use this to calculate deterministic policy findings for an accessible expense.",
      schema: idSchema,
      run: async ({ id }) => {
        const s = await readState();
        const e = s.expenses.find((e) => e.id === id);
        if (!e) throw new DomainError("Expense not found", 404);
        requireRead(actor, e.employeeId, s.profiles);
        return redactInvestigation(investigate([e], s), actor, s);
      },
    }),
    defineTool({
      name: "findDuplicateExpenses",
      description:
        "Use this to find explainable duplicate evidence in accessible claims. A flag is not proof of fraud.",
      schema: z.object({}).strict(),
      run: async () =>
        (await read()).evaluations.map((e) => ({
          claimId: e.claimId,
          findings: e.findings.filter((f) => f.type === "duplicate"),
        })),
    }),
    defineTool({
      name: "calculateReimbursement",
      description:
        "Use this for a deterministic, currency-separated reimbursement breakdown. Does not grant approval.",
      schema: idSchema,
      run: async ({ id }) => (await claimDetails(id)).calculation,
    }),
    defineTool({
      name: "createClaim",
      description:
        "Use this when explicitly asked to group owned unclaimed expenses into a draft claim. Does not submit.",
      schema: claimSchema,
      writes: true,
      run: async (d) => mutate((s) => createClaim(s, actor, d)),
    }),
    defineTool({
      name: "submitClaim",
      description:
        "Use this to PREPARE a submission or resubmission; authenticated user must click the confirmation before it executes.",
      schema: idSchema.extend({ comment: z.string().max(2000).default("") }),
      run: async ({ id, comment }) => propose(actor, id, "SUBMITTED", comment),
    }),
    defineTool({
      name: "getClaimDetails",
      description:
        "Use this to inspect accessible claim records, policies, totals, receipts and evidence. Never fabricate statuses.",
      schema: idSchema,
      run: async ({ id }) => claimDetails(id),
    }),
    defineTool({
      name: "getInvestigationDetails",
      description:
        "Use this to explain risk signal weights and evidence for an accessible claim.",
      schema: idSchema,
      run: async ({ id }) => (await claimDetails(id)).investigation,
    }),
  ];
  if (actor.role === "manager") {
    tools.push(
      defineTool({
        name: "getPendingApprovals",
        description:
          "Use this to list only assigned-team claims awaiting manager review.",
        schema: z.object({}).strict(),
        run: async () =>
          (await read()).claims.filter((c) =>
            ["SUBMITTED", "UNDER_REVIEW"].includes(c.status),
          ),
      }),
      ...(
        ["approveClaim", "rejectClaim", "requestClaimClarification"] as const
      ).map((name) =>
        defineTool({
          name,
          description: `Use this to PREPARE ${name}; requires user confirmation in the authenticated UI. Supply review reason.`,
          schema: idSchema.extend({ comment: z.string().min(3).max(2000) }),
          run: async ({ id, comment }) =>
            propose(
              actor,
              id,
              name === "approveClaim"
                ? "APPROVED"
                : name === "rejectClaim"
                  ? "REJECTED"
                  : "NEEDS_INFORMATION",
              comment,
            ),
        }),
      ),
    );
  }
  if (actor.role === "finance")
    tools.push(
      defineTool({
        name: "getFinanceAnalytics",
        description:
          "Use this for authorized organization aggregates, original currencies and date filters YYYY-MM-DD.",
        schema: z
          .object({
            from: z.iso.date().optional(),
            to: z.iso.date().optional(),
          })
          .strict(),
        run: async ({ from, to }) =>
          analytics(await readState(), actor, from, to),
      }),
    );
  return tools;
}
async function propose(
  actor: Profile,
  id: string,
  status: Status,
  comment: string,
) {
  return mutate((s) => {
    const copy = structuredClone(s);
    transitionClaim(copy, actor, id, { status, comment });
    const proposalId = crypto.randomUUID();
    s.audits.push({
      id: proposalId,
      actorId: actor.id,
      entityId: id,
      action: "AI_CONFIRMATION_PENDING",
      comment: JSON.stringify({ status, comment }),
      at: new Date().toISOString(),
    });
    return {
      confirmationRequired: true,
      proposalId,
      claimId: id,
      status,
      comment,
      expiresInMinutes: 10,
    };
  });
}
export function confirmProposal(s: State, actor: Profile, proposalId: string) {
  const proposal = s.audits.find(
    (a) =>
      a.id === proposalId &&
      a.actorId === actor.id &&
      a.action === "AI_CONFIRMATION_PENDING",
  );
  if (!proposal || Date.now() - new Date(proposal.at).getTime() > 600000)
    throw new DomainError("Confirmation expired or already used", 409);
  const result = transitionClaim(
    s,
    actor,
    proposal.entityId,
    JSON.parse(proposal.comment),
  );
  proposal.action = "AI_CONFIRMED";
  audit(s, actor, proposal.entityId, "AI_ACTION_CONFIRMED");
  return result;
}
