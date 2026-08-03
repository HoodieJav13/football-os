import { useEffect, useMemo, useRef, useState } from "react";
import {
  CaretDown,
  CaretLeft,
  CaretRight,
  CaretUp,
  Funnel,
  MagnifyingGlass,
  Plus,
  X,
} from "@phosphor-icons/react";
import { fieldProjection, polylinePoints } from "./fieldView";
import { changedAssignmentIds } from "./playData";
import { activePlayFilterCount, PLAY_FILTER_FIELDS } from "./playFilters";
import { useDismissable } from "./useDismissable";

const MINI_BOX = { width: 150, height: 96 };

function MiniDiagram({ play, basePlay }) {
  const projection = useMemo(
    () => fieldProjection({ ...MINI_BOX, view: "end", play }),
    [play],
  );
  const changed = useMemo(() => changedAssignmentIds(play, basePlay), [play, basePlay]);
  return (
    <svg className="mini-diagram" viewBox={projection.viewBox} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <line className="mini-line-of-scrimmage" x1={projection.lateralRange[0]} y1="0" x2={projection.lateralRange[1]} y2="0" />
      {play.assignments.map((item) => (
        <polyline
          key={item.id}
          points={polylinePoints(item.points, projection)}
          className={`mini-route mini-${item.type.toLowerCase()} mini-${item.unit} ${changed.has(item.id) ? "mini-diff" : changed.size ? "mini-shared" : ""}`}
        />
      ))}
      {play.players.map((player) => {
        const [cx, cy] = projection.project([player.x, player.y]);
        return <circle key={player.id} cx={cx} cy={cy} r={projection.pixels(3)} />;
      })}
    </svg>
  );
}

export function PlayBrowser({
  activeId,
  allPlays,
  family,
  familyBases,
  filters,
  filterOptions,
  plays,
  canCreate = true,
  onChange,
  onCreate,
  onFilters,
}) {
  const scrollRef = useRef(null);
  const [scrollState, setScrollState] = useState({ previous: false, next: false });
  const mobile = useDismissable();
  const filterPanel = useDismissable();
  const activePlay = allPlays.find((play) => play.id === activeId);
  const activeCount = activePlayFilterCount(filters);

  const measure = () => {
    const element = scrollRef.current;
    if (!element) return;
    setScrollState({
      previous: element.scrollLeft > 4,
      next: element.scrollLeft + element.clientWidth < element.scrollWidth - 4,
    });
  };

  useEffect(() => {
    measure();
    const element = scrollRef.current;
    const observer = new ResizeObserver(measure);
    if (element) observer.observe(element);
    return () => observer.disconnect();
  }, [plays.length]);

  useEffect(() => {
    const element = scrollRef.current?.querySelector(`[data-play-id="${activeId}"]`);
    element?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, [activeId]);

  const setFilter = (key, value) => onFilters({ ...filters, [key]: value });
  const clearStructuredFilters = () => onFilters({
    ...filters,
    ...Object.fromEntries(PLAY_FILTER_FIELDS.map(({ key }) => [key, "all"])),
  });
  const nudge = (direction) => scrollRef.current?.scrollBy({ left: direction * 240, behavior: "smooth" });

  return (
    <section className={`filmstrip ${mobile.open ? "mobile-open" : ""}`} aria-label={`${family} playbook plays`} ref={mobile.containerRef}>
      <button type="button" className="mobile-browser-toggle" aria-expanded={mobile.open} onClick={mobile.toggle}>
        <span><small>Browse</small><strong>{activePlay?.name ?? "No play selected"}</strong></span>
        <span className="mobile-browser-count">{plays.length}/{allPlays.length}</span>
        {mobile.open ? <CaretUp size={18} /> : <CaretDown size={18} />}
      </button>
      <div className="play-browser-controls" ref={filterPanel.containerRef}>
        <label className="play-search">
          <MagnifyingGlass size={16} />
          <input aria-label="Search plays" value={filters.query} onChange={(event) => setFilter("query", event.target.value)} placeholder="Find a play" />
        </label>
        <div className="play-browser-filter-row">
          <select aria-label="Play folder" value={filters.folder} onChange={(event) => setFilter("folder", event.target.value)}>
            <option value="all">All folders</option>
            {filterOptions.folder.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
          <button
            type="button"
            className={`filter-trigger ${activeCount ? "active" : ""}`}
            aria-expanded={filterPanel.open}
            aria-controls="structured-play-filters"
            onClick={filterPanel.toggle}
          >
            <Funnel size={16} weight={activeCount ? "fill" : "regular"} />
            Filters{activeCount ? <span>{activeCount}</span> : null}
          </button>
        </div>
        <small>{plays.length} of {allPlays.length} plays</small>
        {filterPanel.open ? (
          <div className="structured-filter-panel" id="structured-play-filters" aria-label="Structured play filters">
            <div className="structured-filter-heading">
              <div><span>Filter playbook</span><small>Combine football categories</small></div>
              <button type="button" aria-label="Close filters" onClick={filterPanel.close}><X size={18} /></button>
            </div>
            <div className="structured-filter-grid">
              {PLAY_FILTER_FIELDS.map(({ key, label }) => (
                <label key={key}>
                  <span>{label}</span>
                  <select aria-label={label} value={filters[key]} onChange={(event) => setFilter(key, event.target.value)}>
                    <option value="all">All</option>
                    {filterOptions[key].map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
              ))}
            </div>
            <div className="structured-filter-footer">
              <span>{plays.length} matching {plays.length === 1 ? "play" : "plays"}</span>
              <button type="button" disabled={!activeCount} onClick={clearStructuredFilters}>Clear filters</button>
            </div>
          </div>
        ) : null}
      </div>
      {scrollState.previous ? <button className="strip-arrow previous" aria-label="Previous plays" onClick={() => nudge(-1)}><CaretLeft size={22} /></button> : null}
      <div className="filmstrip-scroll" ref={scrollRef} onScroll={measure}>
        {plays.map((play, index) => (
          <button
            key={play.id}
            data-play-id={play.id}
            className={`film-card ${play.id === activeId ? "active" : ""}`}
            onClick={() => { mobile.setOpen(false); onChange(play.id); }}
            aria-label={`Open ${play.name}`}
            aria-current={play.id === activeId ? "true" : undefined}
          >
            <span className="film-index">{index + 1}</span>
            <MiniDiagram play={play} basePlay={familyBases.get(play.family)} />
            <strong>{play.name}</strong>
          </button>
        ))}
        {!plays.length ? (
          <div className="filmstrip-empty">
            <MagnifyingGlass size={23} />
            <strong>No matching plays</strong>
            <span>Adjust search, folder, or football filters.</span>
          </div>
        ) : null}
        {canCreate ? (
          <button className="film-card create-card" onClick={onCreate} aria-label="Create a new play">
            <span className="film-index">New</span>
            <span className="create-play-icon"><Plus size={24} /></span>
            <strong>Create play</strong>
          </button>
        ) : null}
      </div>
      {scrollState.next ? <button className="strip-arrow next" aria-label="Next plays" onClick={() => nudge(1)}><CaretRight size={22} /></button> : null}
    </section>
  );
}
