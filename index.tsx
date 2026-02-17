import React from 'react';
import './index.css';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: Error | null }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 20, color: 'red', fontFamily: 'sans-serif' }}>
          <h1>Something went wrong.</h1>
          <pre>{this.state.error?.toString()}</pre>
          <button onClick={() => window.location.reload()} style={{ padding: '10px 20px', marginTop: 10, cursor: 'pointer' }}>
            Reload Application
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  // Removed React.StrictMode to mitigate Firestore double-invocation issues in dev
  <ErrorBoundary>
    <AuthProvider>
      <App />
    </AuthProvider>
  </ErrorBoundary>
);