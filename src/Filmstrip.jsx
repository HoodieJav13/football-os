import { useEffect, useMemo, useRef, useState } from "react";
import { fieldProjection, polylinePoints } from "./fieldView";
import { changedAssignmentIds } from "./playData";
import { useDismissable } from "./useDismissable";
import { CaretDown, CaretLeft, CaretRight, CaretUp, MagnifyingGlass, Play, Plus } from "@phosphor-icons/react";

/** The play browser: search, folders, and thumbnails drawn from each play's own data. */
const MINI_BOX = { width: 150, height: 96 };

function MiniDiagram({ play, basePlay }) {
  const projection = useMemo(
    () => fieldProjection({ ...MINI_BOX, view: "end", play }),
    [play],
  );
  /*
   * Variants of one family share almost everything, which made their cards
   * read as identical. Routes that differ from the family's base play are
   * emphasised and the shared ones recede, so a card says what its variant
   * *changes* rather than repeating the family.
   */
  const changed = useMemo(() => changedAssignmentIds(play, basePlay), [play, basePlay]);
  return (
    <svg
      className="mini-diagram"
      viewBox={projection.viewBox}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <line
        className="mini-line-of-scrimmage"
        x1={projection.lateralRange[0]}
        y1="0"
        x2={projection.lateralRange[1]}
        y2="0"
      />
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

export function Filmstrip({
  activeId,
  family,
  familyBases,
  folder,
  folders,
  fullCount,
  library,
  onChange,
  onCreate,
  onFolder,
  onQuery,
  query,
}) {
  const scrollRef = useRef(null);
  const [scrollState, setScrollState] = useState({ previous: false, next: false });
  const { open: mobileOpen, setOpen: setMobileOpen, toggle: toggleMobile, containerRef } = useDismissable();
  const activePlay = library.find((play) => play.id === activeId);

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
  }, [library.length]);

  useEffect(() => {
    const element = scrollRef.current?.querySelector(`[data-play-id="${activeId}"]`);
    element?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, [activeId]);

  const nudge = (direction) => scrollRef.current?.scrollBy({ left: direction * 240, behavior: "smooth" });

  return (
    <section className={`filmstrip ${mobileOpen ? "mobile-open" : ""}`} aria-label={`${family} playbook plays`} ref={containerRef}>
      <button
        type="button"
        className="mobile-browser-toggle"
        aria-expanded={mobileOpen}
        onClick={toggleMobile}
      >
        <span><small>Browse</small><strong>{activePlay?.name ?? "No matching play"}</strong></span>
        <span className="mobile-browser-count">{library.length}/{fullCount}</span>
        {mobileOpen ? <CaretUp size={18} /> : <CaretDown size={18} />}
      </button>
      <div className="play-browser-controls">
        <label>
          <MagnifyingGlass size={16} />
          <input aria-label="Search plays" value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Find a play" />
        </label>
        <select aria-label="Play folder" value={folder} onChange={(event) => onFolder(event.target.value)}>
          <option value="all">All folders</option>
          {folders.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <small>{library.length} of {fullCount} plays</small>
      </div>
      {scrollState.previous ? <button className="strip-arrow previous" aria-label="Previous plays" onClick={() => nudge(-1)}><CaretLeft size={22} /></button> : null}
      <div className="filmstrip-scroll" ref={scrollRef} onScroll={measure}>
        {library.map((play, index) => (
          <button
            key={play.id}
            data-play-id={play.id}
            className={`film-card ${play.id === activeId ? "active" : ""}`}
            onClick={() => { setMobileOpen(false); onChange(play.id); }}
            aria-label={`Open ${play.name}`}
            aria-current={play.id === activeId ? "true" : undefined}
          >
            <span className="film-index">{index + 1}</span>
            <MiniDiagram play={play} basePlay={familyBases.get(play.family)} />
            <strong>{play.name}</strong>
          </button>
        ))}
        {!library.length ? (
          <div className="filmstrip-empty">
            <MagnifyingGlass size={23} />
            <strong>No matching plays</strong>
            <span>Clear the search or choose another folder.</span>
          </div>
        ) : null}
        <button className="film-card create-card" onClick={onCreate} aria-label="Create a new play">
          <span className="film-index">New</span>
          <span className="create-play-icon"><Plus size={24} /></span>
          <strong>Create play</strong>
        </button>
      </div>
      {scrollState.next ? <button className="strip-arrow next" aria-label="Next plays" onClick={() => nudge(1)}><CaretRight size={22} /></button> : null}
    </section>
  );
}
