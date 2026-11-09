// This function runs inside YouTube's main world to read its caption-track metadata.
// It only fetches the active video's first-party timedtext URL.
export async function readCaptions(expectedId) {
  try {
    if (new URL(location.href).searchParams.get("v") !== expectedId)
      return { error: "Video changed." };
    const player = document.getElementById("movie_player");
    const data =
      player?.getPlayerResponse?.() || window.ytInitialPlayerResponse;
    if (data?.videoDetails?.videoId !== expectedId)
      return { error: "Caption metadata is not ready." };
    const tracks =
      data?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    const track =
      tracks.find((t) => t.languageCode === "en" && t.kind !== "asr") ||
      tracks.find((t) => t.languageCode?.startsWith("en")) ||
      tracks[0];
    if (!track?.baseUrl) return { error: "No caption track available." };
    const url = new URL(track.baseUrl);
    if (
      url.hostname !== "www.youtube.com" ||
      url.protocol !== "https:" ||
      url.pathname !== "/api/timedtext"
    )
      return { error: "Unrecognized caption source." };
    url.searchParams.set("fmt", "json3");
    const response = await fetch(url.href, {
      credentials: "same-origin",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return { error: "Caption request failed." };
    const json = await response.json();
    const text = (json.events || [])
      .map((e) => {
        const line = (e.segs || [])
          .map((s) => s.utf8 || "")
          .join("")
          .replace(/\s+/g, " ")
          .trim();
        const seconds = Math.floor((e.tStartMs || 0) / 1000);
        return line
          ? `[${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}] ${line}`
          : "";
      })
      .filter(Boolean)
      .join("\n");
    if (new URL(location.href).searchParams.get("v") !== expectedId)
      return { error: "Video changed." };
    return text.length >= 150
      ? { text, title: data.videoDetails.title, language: track.languageCode }
      : { error: "Caption response was empty." };
  } catch (e) {
    return { error: e.message || "Could not fetch captions." };
  }
}
