import { PlayCanvas } from './PlayCanvas';
import { regionLegendLayout } from './ResponsibilityAreas';

/** Measured independently of the editor so export never changes its camera. */
export function LessonExport({play,view,layers,onReady,format="wide"}) {
  const phone = format === "phone";
  const width = phone ? 390 : 1200;
  const height = (phone ? 480 : 800) + regionLegendLayout(play,layers,width).height;
  return <div className="lesson-export" aria-hidden="true" style={{width,height}}>
    <PlayCanvas play={play} view={view} layers={layers} phoneOutput={phone} clean framePlay activeTool="Select" playback="idle" draftAssignment={[]} speed={1} onReady={onReady} />
  </div>;
}
