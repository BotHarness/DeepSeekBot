export function requestListener(handler) {
  return (request, response) => {
    handler(request, response).catch((error) => {
      console.error(error);
      process.exitCode = 1;
      if (!response.headersSent) response.writeHead(500, { 'content-type': 'text/plain' });
      response.end(error instanceof Error ? error.message : 'request failed');
    });
  };
}
