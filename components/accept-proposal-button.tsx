import { acceptProposalAction } from "@/app/(app)/actions/connections";
import { ActionButton } from "@/components/action-button";

export function AcceptProposalButton({ connectionId }: { connectionId: string }) {
  return (
    <ActionButton action={acceptProposalAction} fields={{ connectionId }}>
      Accetta
    </ActionButton>
  );
}
