import type { IssueLetterStatus } from "@/lib/types";

export const ISSUE_LETTER_STATUS_LABEL: Record<IssueLetterStatus, string> = {
  draft: "초안",
  in_review: "검수 중",
  published: "발행됨",
  archived: "내림",
};

export function IssueLetterStatusBadge({ status }: { status: IssueLetterStatus }) {
  const cls = status === "published" ? "ui-badge-published" : status === "archived" ? "ui-badge-archived" : "ui-badge-draft";
  return <span className={`ui-badge ${cls}`}>{ISSUE_LETTER_STATUS_LABEL[status]}</span>;
}
