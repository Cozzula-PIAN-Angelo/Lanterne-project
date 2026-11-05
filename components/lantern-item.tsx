import { deleteLanternAction, reactAction, saveAction } from "@/app/(app)/actions/lanterns";
import { ActionButton } from "@/components/action-button";
import type { LanternView } from "@/lib/access/lanterns";
import { lanternContent } from "@/lib/lanterns/content";
import { REACTIONS } from "@/lib/lanterns/constants";
import { atTime } from "@/lib/time/format";

type Props = { lantern: LanternView; connectionId: string; viewerTz: string };

function Content({ lantern, viewerTz }: Omit<Props, "connectionId">) {
  return (
    <>
      <p className="whitespace-pre-wrap break-words">{lanternContent(lantern)}</p>
      <p className="text-xs text-muted-foreground">Inviata {atTime(lantern.createdAt, viewerTz)}</p>
    </>
  );
}

/** Una lanterna arrivata: chi la riceve può reagire e conservarla. */
export function ArrivedLantern({ lantern, connectionId, viewerTz }: Props) {
  const fields = { connectionId, lanternId: lantern.id };
  return (
    <li className="space-y-2 rounded-xl border p-4">
      <Content lantern={lantern} viewerTz={viewerTz} />
      <div className="flex flex-wrap gap-1">
        {REACTIONS.map((reaction) => {
          const active = lantern.reaction === reaction;
          return (
            <ActionButton
              key={reaction}
              action={reactAction}
              fields={{ ...fields, reaction: active ? "" : reaction }}
              variant={active ? "default" : "outline"}
              size="icon"
              aria-pressed={active}
            >
              {reaction}
            </ActionButton>
          );
        })}
      </div>
      {lantern.savedAt ? (
        <p className="text-sm text-muted-foreground">Conservata</p>
      ) : (
        lantern.savable && (
          <ActionButton action={saveAction} fields={fields} variant="outline">
            Conserva
          </ActionButton>
        )
      )}
    </li>
  );
}

/** Una lanterna inviata: sigillata si può eliminare, aperta mostra cosa ne ha fatto l'altro. */
export function SentLantern({
  lantern,
  connectionId,
  viewerTz,
  partnerName,
}: Props & { partnerName: string }) {
  return (
    <li className="space-y-2 rounded-xl border p-4">
      <Content lantern={lantern} viewerTz={viewerTz} />
      {lantern.sealed && (
        <ActionButton
          action={deleteLanternAction}
          fields={{ connectionId, lanternId: lantern.id }}
          variant="outline"
        >
          Elimina
        </ActionButton>
      )}
      {!lantern.sealed && lantern.reaction && <p aria-label={`Reazione di ${partnerName}`}>{lantern.reaction}</p>}
      {!lantern.sealed && lantern.savedAt && (
        <p className="text-sm text-muted-foreground">{partnerName} l&apos;ha conservata</p>
      )}
    </li>
  );
}

/** Un ricordo: solo da rileggere. */
export function MemoryLantern({ lantern, viewerTz }: Omit<Props, "connectionId">) {
  return (
    <li className="space-y-2 rounded-xl border p-4">
      <Content lantern={lantern} viewerTz={viewerTz} />
    </li>
  );
}
