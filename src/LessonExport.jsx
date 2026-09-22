import { PlayCanvas } from './PlayCanvas';
import { regionLegendLayout } from './ResponsibilityAreas';

/** Measured independently of the editor so export never changes its camera. */
export function LessonExport({play,view,layers,onReady}) {
  const height = 800 + regionLegendLayout(play,layers,1200).height;
  return <div className="lesson-export" aria-hidden="true" style={{width:1200,height}}>
    <PlayCanvas play={play} view={view} layers={layers} clean framePlay activeTool="Select" playback="idle" draftAssignment={[]} speed={1} onReady={onReady} />
  </div>;
}
