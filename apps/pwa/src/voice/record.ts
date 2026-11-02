/** Records the patient's spoken answer with the phone microphone (needs HTTPS). */
export interface Recording {
  stop(): Promise<Blob>;
  cancel(): void;
}

const MAX_SECONDS = 20;

export async function startRecording(): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const type = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t));
  const recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
  recorder.start();
  const limit = setTimeout(() => recorder.state === "recording" && recorder.stop(), MAX_SECONDS * 1000);

  const finished = new Promise<Blob>((resolve) => {
    recorder.onstop = () => {
      clearTimeout(limit);
      stream.getTracks().forEach((t) => t.stop());
      resolve(new Blob(chunks, { type: recorder.mimeType }));
    };
  });

  return {
    stop() {
      if (recorder.state === "recording") recorder.stop();
      return finished;
    },
    cancel() {
      if (recorder.state === "recording") recorder.stop();
    },
  };
}
