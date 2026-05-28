import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('Runtime error captured by ErrorBoundary:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '1rem' }}>
          <div className="card" style={{ maxWidth: 560 }}>
            <h1>Terjadi Kesalahan</h1>
            <p>Aplikasi mengalami error runtime, tetapi tidak crash total.</p>
            <p>Silakan refresh halaman. Jika berulang, periksa konfigurasi environment.</p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
