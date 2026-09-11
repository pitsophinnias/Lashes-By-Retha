function App() {
  return (
    <div className="page">
      <style>{`
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        body {
          background-color: #FFFFFF;
          color: #1A1A1A;
        }

        .page {
          font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Arial, sans-serif;
          background-color: #FFFFFF;
          color: #1A1A1A;
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 2rem;
        }

        .admin-heading {
          font-size: 2rem;
          font-weight: 700;
          color: #1A1A1A;
          margin-bottom: 1rem;
        }

        .admin-text {
          font-size: 1.1rem;
          color: #A0596A;
        }
      `}</style>

      <h1 className="admin-heading">Lashes By Retha — Admin</h1>
      <p className="admin-text">Admin dashboard coming soon.</p>
    </div>
  )
}

export default App
