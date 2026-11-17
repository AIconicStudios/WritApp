/** Saving exported files on the phone: write to the app's documents folder, then open Android's share sheet. */
export async function saveAndShare(fileName: string, bytes: Uint8Array, mime: string) {
  const { Capacitor } = await import("@capacitor/core");
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const { Share } = await import("@capacitor/share");
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    let res;
    try {
      res = await Filesystem.writeFile({ path: `Cashless Edit/${fileName}`, data: btoa(bin), directory: Directory.Documents, recursive: true });
    } catch {
      // Some Android versions restrict shared folders: keep it in app storage and hand it to the share sheet.
      res = await Filesystem.writeFile({ path: fileName, data: btoa(bin), directory: Directory.Cache, recursive: true });
    }
    try {
      await Share.share({ title: fileName, url: res.uri, dialogTitle: "Save or send " + fileName });
    } catch {
      /* user closed the share sheet — the file is still saved in Documents/Cashless Edit */
    }
    return res.uri;
  }
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return url;
}
