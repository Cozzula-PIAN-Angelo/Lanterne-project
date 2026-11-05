import { deleteLanternAction, reactAction, saveAction } from "@/app/(app)/actions/lanterns";
import { ActionButton } from "@/components/action-button";
import { MediaPlayer } from "@/components/media-player";
import type { LanternView } from "@/lib/access/lanterns";
import { lanternContent } from "@/lib/lanterns/content";
import { REACTIONS } from "@/lib/lanterns/constants";
import { lanternLabel } from "@/lib/lanterns/labels";
import { atTime } from "@/lib/time/format";

type Props = { lantern: LanternView; connectionId: string; viewerTz: string };

function Content({ lantern, viewerTz, player }: Omit<Props, "connectionId"> & { player?: React.ReactNode }) {
  return (
    <>
      <p className="whitespace-pre-wrap break-words">{lanternContent(lantern)}</p>
      {player}
      <p className="text-xs text-muted-foreground">Inviata {atTime(lantern.createdAt, viewerTz)}</p>
    </>
  );
}

/** Il player di una lanterna con un file: un vocale si ascolta, una foto si apre. */
function receivedPlayer(lantern: LanternView, senderName: string, viewerTz: string) {
  if (lantern.type !== "audio" && lantern.type !== "photo") return undefined;
  const label = lanternLabel({ ...lantern, senderName, viewerTz });
  return (
    <MediaPlayer
      lanternId={lantern.id}
      type={lantern.type}
      action={lantern.type === "audio" ? "Ascolta" : "Apri"}
      label={label}
    />
  );
}

/** Una lanterna arrivata: chi la riceve può reagire e conservarla. */
export function ArrivedLantern({
  lantern,
  connectionId,
  viewerTz,
  senderName,
}: Props & { senderName: string }) {
  const fields = { connectionId, lanternId: lantern.id };
  return (
    <li className="space-y-2 rounded-xl border p-4">
      <Content lantern={lantern} viewerTz={viewerTz} player={receivedPlayer(lantern, senderName, viewerTz)} />
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
  const player =
    lantern.type === "audio" || lantern.type === "photo" ? (
      <MediaPlayer
        lanternId={lantern.id}
        type={lantern.type}
        action={lantern.type === "audio" ? "Riascolta" : "Rivedi"}
        label={lanternContent(lantern)}
      />
    ) : undefined;
  return (
    <li className="space-y-2 rounded-xl border p-4">
      <Content lantern={lantern} viewerTz={viewerTz} player={player} />
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
export function MemoryLantern({
  lantern,
  viewerTz,
  senderName,
}: Omit<Props, "connectionId"> & { senderName: string }) {
  return (
    <li className="space-y-2 rounded-xl border p-4">
      <Content lantern={lantern} viewerTz={viewerTz} player={receivedPlayer(lantern, senderName, viewerTz)} />
    </li>
  );
}
