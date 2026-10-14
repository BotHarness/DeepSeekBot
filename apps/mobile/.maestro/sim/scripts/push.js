const response = http.post(`${TRIGGER}/push/${NAME}`, { body: '' });
if (response.status !== 200) throw new Error(`push trigger answered ${response.status}`);
