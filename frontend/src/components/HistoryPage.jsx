import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * HistoryPage
 *
 * Displays a list of previously saved diagrams stored in MongoDB.
 * Clicking a row navigates back to the editor with that diagram loaded.
 */
function HistoryPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    setError(null);

    fetch('http://localhost:3001/api/diagrams')
      .then((res) => {
        if (!res.ok) {
          throw new Error('Failed to fetch diagrams');
        }
        return res.json();
      })
      .then((data) => {
        setItems(data);
      })
      .catch((err) => {
        console.error(err);
        setError('Failed to load history.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const openDiagram = (id) => {
    navigate(`/?id=${encodeURIComponent(id)}`);
  };

  return (
    <div className="history-page">
      <h2>Saved Processes</h2>

      {loading && (
        <div className="loading-state">
          <p>Loading processes...</p>
        </div>
      )}

      {error && (
        <div className="error-state">
          <p>{error}</p>
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="empty-state">
          <p>No processes have been saved yet.</p>
          <p style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>
            Create and save a process diagram to see it here.
          </p>
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <div className="history-table-container">
          <table className="history-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Source File</th>
                <th>Created</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => openDiagram(item.id)}
                  className="history-row"
                >
                  <td>
                    <strong>{item.name}</strong>
                  </td>
                  <td>{item.sourceFileName || '-'}</td>
                  <td>
                    {item.createdAt
                      ? new Date(item.createdAt).toLocaleString()
                      : '-'}
                  </td>
                  <td>
                    {item.updatedAt
                      ? new Date(item.updatedAt).toLocaleString()
                      : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default HistoryPage;


