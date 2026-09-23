import { fittedOutputHeight } from './fieldView';
import { PlayCanvas } from './PlayCanvas';
import { regionLegendLayout } from './ResponsibilityAreas';

/** Measured independently of the editor so export never changes its camera. */
export function LessonExport({play,view,layers,onReady,format="wide",background="field"}) {
  const phone = format === "phone";
  const width = phone ? 390 : 1200;
  const fieldHeight = background === "diagram" ? fittedOutputHeight(play,width,view) : (phone ? 480 : 800);
  const height = fieldHeight + regionLegendLayout(play,layers,width).height;
  return <div className="lesson-export" aria-hidden="true" style={{width,height}}>
    <PlayCanvas background={background} play={play} view={view} layers={layers} phoneOutput={phone} clean framePlay activeTool="Select" playback="idle" draftAssignment={[]} speed={1} onReady={onReady} />
  </div>;
}
