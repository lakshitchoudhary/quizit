export function pageRangeKey(value = "") {
  if (/\d\s+\d/.test(value))
    throw Error("Separate PDF pages with commas, for example 1, 2.");
  return value.toLowerCase().replace(/\s/g, "") || "all";
}
export function selectPages(value, total) {
  const range = pageRangeKey(value);
  if (!Number.isInteger(total) || total < 1)
    throw Error("The PDF has no readable pages.");
  const selected = new Set();
  if (range === "all") {
    if (total > 500)
      throw Error(
        "This PDF has " +
          total +
          " pages. Enter a PDF page range of at most 500 pages, for example 1-20.",
      );
    for (let p = 1; p <= total; p++) selected.add(p);
  } else {
    if (range.length > 2000) throw Error("Use a shorter PDF page range.");
    for (const part of range.split(",")) {
      if (!/^\d+(?:-\d+)?$/.test(part))
        throw Error("Use PDF page numbers such as 1-20, 35, 40-50, or All.");
      const [start, end = start] = part.split("-").map(Number);
      if (start < 1 || end < start || end > total)
        throw Error(
          "This PDF has " +
            total +
            " pages. Choose a range between 1 and " +
            total +
            ".",
        );
      if (end - start + 1 > 500)
        throw Error("Select at most 500 PDF pages per session.");
      for (let p = start; p <= end; p++) selected.add(p);
      if (selected.size > 500)
        throw Error("Select at most 500 PDF pages per session.");
    }
  }
  const pages = [...selected].sort((a, b) => a - b);
  return {
    pages,
    label:
      range === "all"
        ? total === 1
          ? "Page 1"
          : "All " + total + " pages"
        : pages.length === 1
          ? "Page " + pages[0]
          : "Pages " + range,
    total,
  };
}
