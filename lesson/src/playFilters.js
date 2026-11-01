export const PLAY_FILTER_FIELDS = [
  { key: "personnel", label: "Personnel" },
  { key: "formation", label: "Formation" },
  { key: "family", label: "Play family" },
  { key: "protection", label: "Protection / OL call" },
  { key: "blockingScheme", label: "Blocking scheme" },
];

export function createEmptyPlayFilters() {
  return {
    query: "",
    folder: "all",
    personnel: "all",
    formation: "all",
    family: "all",
    protection: "all",
    blockingScheme: "all",
  };
}
const uniqueValues = (plays, key) => [...new Set(
  plays.map((play) => play[key]).filter((value) => typeof value === "string" && value.trim()),
)].sort((left, right) => left.localeCompare(right));

export function createPlayFilterOptions(plays) {
  return {
    folder: uniqueValues(plays.map((play) => ({ ...play, folder: play.folder ?? "Unfiled" })), "folder"),
    ...Object.fromEntries(PLAY_FILTER_FIELDS.map(({ key }) => [key, uniqueValues(plays, key)])),
  };
}

export function activePlayFilterCount(filters) {
  return PLAY_FILTER_FIELDS.reduce((count, { key }) => count + (filters[key] !== "all" ? 1 : 0), 0);
}

export function filterPlays(plays, filters) {
  const query = filters.query.trim().toLowerCase();
  return plays.filter((play) => {
    if (filters.folder !== "all" && (play.folder ?? "Unfiled") !== filters.folder) return false;
    if (PLAY_FILTER_FIELDS.some(({ key }) => filters[key] !== "all" && play[key] !== filters[key])) return false;
    if (!query) return true;
    return [
      play.name,
      play.conceptName,
      play.sourceCall,
      play.family,
      play.formation,
      play.personnel,
      play.protection,
      play.blockingScheme,
      play.folder,
    ].some((value) => value?.toLowerCase().includes(query));
  });
}

export function createFamilyBases(plays) {
  const bases = new Map();
  for (const play of plays) if (!bases.has(play.family)) bases.set(play.family, play);
  return bases;
}
