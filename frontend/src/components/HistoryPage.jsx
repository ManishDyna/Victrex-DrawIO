import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

// API URL from environment variable or fallback to localhost
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

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

    fetch(`${API_URL}/api/diagrams`)
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
    navigate(`/editor?id=${encodeURIComponent(id)}&view=diagram`);
  };

  const openFormView = (id) => {
    navigate(`/editor?id=${encodeURIComponent(id)}&view=form`);
  };

  const handleProcessClick = (id) => {
    // Default behavior: open form view in editor
    openFormView(id);
  };

  return (
    <div className="history-page">
      <h2>Available Processes</h2>

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
                <th>Process Owner</th>
                <th>Source File</th>
                <th>Created</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.id}
                  className="history-row"
                  onClick={() => handleProcessClick(item.id)}
                >
                  <td>
                    <strong>{item.name}</strong>
                  </td>
                  <td>{item.processOwner || '-'}</td>
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
                  <td>
                    <div className="history-actions">
                      <button
                        className="action-button view-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openDiagram(item.id);
                        }}
                        title="View Diagram"
                      >
                        <i className="fa fa-eye"></i>
                      </button>
                      <button
                        className="action-button edit-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openFormView(item.id);
                        }}
                        title="Edit Form"
                      >
                        <i className="fa fa-edit"></i>
                      </button>
                    </div>
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


