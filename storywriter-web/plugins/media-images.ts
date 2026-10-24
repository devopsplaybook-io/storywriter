import { useMediaStore } from "~/stores/media";
import { createMediaImagesDirective } from "~/utils/mediaImage";

export default defineNuxtPlugin((nuxtApp) => {
  // One-shot cleanup: the pre-0.13 service worker cached private media (with
  // tokenized URLs) in a "media-files" runtime cache; Workbox only cleans
  // precaches, so drop it on the client after this update.
  if (typeof window !== "undefined" && "caches" in window) {
    caches.keys().then((keys) => {
      for (const key of keys) {
        if (key === "media-files") {
          caches.delete(key);
        }
      }
    });
  }

  const mediaStore = useMediaStore(nuxtApp.$pinia);
  nuxtApp.vueApp.directive(
    "media-images",
    createMediaImagesDirective({
      fetchObjectUrl: mediaStore.fetchMediaObjectUrl,
      releaseObjectUrl: mediaStore.releaseMediaObjectUrl,
    }),
  );
});
