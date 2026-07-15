import type { DragEvent } from "react";
import type { ModelAsset } from "../model-analysis";
import type { UploadedModel } from "../workflow";

export function UploadStep({
  model,
  error,
  onFile,
}: {
  model: UploadedModel<ModelAsset> | null;
  error: string | null;
  onFile(file: File): void;
}) {
  const acceptDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) onFile(file);
  };
  const analysis = model?.asset.analysis;

  return (
    <section className="step-panel" aria-labelledby="upload-heading">
      <h2 id="upload-heading">Upload an STL model</h2>
      <p>STL files are parsed locally in your browser and never uploaded.</p>
      <div
        className="drop-zone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={acceptDrop}
      >
        <label htmlFor="stl-file">Choose an STL file</label>
        <input
          id="stl-file"
          type="file"
          accept=".stl,model/stl"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onFile(file);
            event.target.value = "";
          }}
        />
        <span>or drag and drop it here</span>
      </div>
      {error && <p role="alert" className="alert error">{error}</p>}
      {model && analysis && (
        <div className="model-summary">
          <h3>{model.file.name}</h3>
          <p>{(model.file.size / 1024).toFixed(1)} KB · {analysis.triangleCount.toLocaleString()} triangles</p>
          <p>
            {analysis.bounds.size.x.toFixed(2)} × {analysis.bounds.size.y.toFixed(2)} ×
            {" "}{analysis.bounds.size.z.toFixed(2)} mm
          </p>
          {analysis.isHuge && (
            <p className="alert warning">Large model: previewing and slicing may be slow.</p>
          )}
        </div>
      )}
    </section>
  );
}
