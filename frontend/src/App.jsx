import './App.css';
import { Routes, Route, NavLink } from 'react-router-dom';
import EditorPage from './components/EditorPage';
import HistoryPage from './components/HistoryPage';
import FormView from './components/FormView';

/**
 * App component: defines top-level navigation and routes.
 */
function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>Victrex Flowstudio</h1>
        <nav className="app-nav">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              isActive ? 'nav-link nav-link-active' : 'nav-link'
            }
          >
            Available Processes
          </NavLink>
          <NavLink
            to="/editor?action=upload"
            className={({ isActive }) =>
              isActive ? 'nav-link nav-link-active' : 'nav-link'
            }
          >
            <i className="fa fa-upload"></i> Upload Diagram
          </NavLink>
        </nav>
      </header>

      <main className="app-content">
        <Routes>
          <Route path="/" element={<HistoryPage />} />
          <Route path="/editor" element={<EditorPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/form/:id" element={<FormView />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
