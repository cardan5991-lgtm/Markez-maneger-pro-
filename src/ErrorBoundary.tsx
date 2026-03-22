import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      let errorMessage = this.state.error?.message || 'Unknown error';
      let errorDetails = this.state.error?.stack;
      
      try {
        const parsedError = JSON.parse(errorMessage);
        if (parsedError.error && parsedError.operationType) {
          errorMessage = `Error de permisos en Firebase: ${parsedError.error}`;
          errorDetails = `Operación: ${parsedError.operationType}\nRuta: ${parsedError.path}\nUsuario: ${parsedError.authInfo?.email || 'Anónimo'}`;
        }
      } catch (e) {
        // Not a JSON error
      }

      return (
        <div style={{ padding: '20px', color: '#ef4444', backgroundColor: '#1a1a1a', minHeight: '100vh', fontFamily: 'sans-serif' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '16px' }}>Algo salió mal.</h1>
          <p style={{ marginBottom: '16px', color: '#fff' }}>{errorMessage}</p>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: '12px', color: '#9ca3af', backgroundColor: '#000', padding: '16px', borderRadius: '8px', overflowX: 'auto' }}>
            {errorDetails}
          </pre>
          <button 
            onClick={() => window.location.reload()}
            style={{ marginTop: '20px', padding: '10px 20px', backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
          >
            Recargar aplicación
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
