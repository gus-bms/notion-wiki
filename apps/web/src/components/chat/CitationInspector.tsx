import { SelectedCitation } from "../../lib/types";

interface CitationInspectorProps {
  selectedCitation: SelectedCitation | null;
  onClear: () => void;
}

export function CitationInspector({ selectedCitation, onClear }: CitationInspectorProps): JSX.Element {
  return (
    <aside className="citation-panel">
      <h2>Citation inspector</h2>
      {!selectedCitation && <p>Select a citation from the chat to inspect source proof.</p>}
      {selectedCitation && (
        <article className="citation-card">
          <small>
            #{selectedCitation.sourceCitationIndex + 1} from {new Date(selectedCitation.fromAskedAtIso).toLocaleString()}
          </small>
          <p className="citation-question">{selectedCitation.fromQuestion}</p>
          <h3>{selectedCitation.citation.title || "Untitled"}</h3>
          <p className="citation-quote">{selectedCitation.citation.quote}</p>
          <small>chunkId: {selectedCitation.citation.chunkId}</small>
          <div className="inline-actions">
            {selectedCitation.citation.url ? (
              <a href={selectedCitation.citation.url} target="_blank" rel="noreferrer">
                Open source
              </a>
            ) : (
              <span className="muted">Source URL missing</span>
            )}
            <button type="button" className="button-secondary" onClick={onClear}>
              Clear
            </button>
          </div>
        </article>
      )}
    </aside>
  );
}
