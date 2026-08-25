// Centralized error handling middleware for Express
// Catches unhandled errors from route handlers

function errorHandler(err, req, res, next) {
  const timestamp = new Date().toISOString();

  // SQLite errors
  if (err.code === 'SQLITE_CONSTRAINT' || err.constructor?.name === 'SqliteError') {
    console.error(`[${timestamp}] SQLite Error:`, err.message);
    return res.status(409).json({
      error: 'Database constraint violation',
      detail: err.message
    });
  }

  // Validation errors (thrown by routes)
  if (err.status && err.status < 500) {
    return res.status(err.status).json({ error: err.message });
  }

  // Unexpected errors
  console.error(`[${timestamp}] Unhandled Error:`, err.stack || err.message);
  res.status(500).json({
    error: 'Internal server error',
    ...(process.env.NODE_ENV !== 'production' ? { detail: err.message } : {})
  });
}

// Wrapper for async route handlers — catches promise rejections
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { errorHandler, asyncHandler };
