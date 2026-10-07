// src/registry.ts
var live = new Map;
function registerEmbed(brand, end) {
  const ends = live.get(brand) ?? new Set;
  ends.add(end);
  live.set(brand, ends);
  return () => {
    ends.delete(end);
  };
}
function endRegisteredEmbeds(brand) {
  const ends = live.get(brand);
  if (ends === undefined) {
    return;
  }
  for (const end of [...ends]) {
    end();
  }
}

export { registerEmbed, endRegisteredEmbeds };
