export function LoadingRows() {
  return (
    <ul className="command-list" aria-busy="true" aria-label="Loading commands">
      {[0, 1, 2, 3, 4].map((index) => (
        <li key={index} className="command-row">
          <div className="command-info">
            <span className="skeleton" style={{ width: '60%' }} />
            <span className="skeleton skeleton-small" style={{ width: '80%' }} />
            <span className="skeleton skeleton-tag" />
          </div>
          <div className="terminal">
            <span className="skeleton" style={{ width: `${45 + index * 8}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
