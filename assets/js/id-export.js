let captureSequence = 0;

export async function captureIdCard(card, scale = 3) {
  if (!window.html2canvas) throw new Error("The ID export library did not load.");
  if (!card?.classList?.contains("student-id")) throw new Error("The ID preview could not be prepared for export.");
  if (document.fonts?.ready) await document.fonts.ready;
  await waitForCardImages(card);

  const captureId = `card-${Date.now()}-${captureSequence += 1}`;
  card.dataset.exportCapture = captureId;
  try {
    return await window.html2canvas(card, {
      scale,
      backgroundColor: "#ffffff",
      useCORS: true,
      allowTaint: false,
      imageTimeout: 15000,
      logging: false,
      onclone(clonedDocument) {
        const exportedCard = clonedDocument.querySelector(`[data-export-capture="${captureId}"]`);
        if (exportedCard) exportedCard.classList.add("student-id--export");
      },
    });
  } finally {
    delete card.dataset.exportCapture;
  }
}

export async function captureIdCardBlob(card, scale = 3) {
  const canvas = await captureIdCard(card, scale);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("An ID image could not be created.")), "image/png");
  });
}

function waitForCardImages(card) {
  return Promise.all([...card.querySelectorAll("img")].map((image) => {
    if (image.complete && image.naturalWidth > 0) return Promise.resolve();
    return new Promise((resolve) => {
      image.addEventListener("load", resolve, { once: true });
      image.addEventListener("error", resolve, { once: true });
    });
  }));
}
