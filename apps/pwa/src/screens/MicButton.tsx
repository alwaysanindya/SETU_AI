/** Tap to speak, tap again to finish. Shows what is being heard while the patient talks. */
import type { Lang } from "@setu/bank";
import { useRef, useState } from "react";
import { ui } from "../i18n";
import { canListen, MicUnavailableError, startListening, type Listening } from "../voice/listen";
import { stopSpeaking } from "../voice/speak";

export function MicButton({ lang, disabled, onHeard, onUnavailable }: {
  lang: Lang;
  disabled?: boolean;
  onHeard: (text: string) => void;
  onUnavailable: () => void;
}) {
  const [listening, setListening] = useState<Listening>();
  const [partial, setPartial] = useState("");
  const busy = useRef(false);

  async function toggle() {
    if (listening) return listening.stop();
    if (busy.current) return;
    if (!canListen()) return onUnavailable();
    busy.current = true;
    stopSpeaking();
    setPartial("");
    try {
      const l = await startListening(lang, setPartial);
      setListening(l);
      const text = await l.result;
      onHeard(text);
    } catch (e) {
      if (e instanceof MicUnavailableError) onUnavailable();
      else onHeard("");
    } finally {
      setListening(undefined);
      busy.current = false;
    }
  }

  return (
    <div className="mic-wrap">
      {listening && <p className="partial">{partial || ui("speakNow", lang)}</p>}
      <button className={`mic ${listening ? "on" : ""}`} disabled={disabled} onClick={toggle} aria-label={ui("speak", lang)}>
        🎤 {listening ? ui("stop", lang) : ui("speak", lang)}
      </button>
    </div>
  );
}
