export function installGenuiFaultTransport() {
  const original = window.fetch.bind(window);
  const observation = { fault: undefined, calls: [], messages: [] };
  window.__genuiFaultQa = observation;
  window.addEventListener('message', (event) => {
    if (event.data?.protocol === 'botharness-genui-v1') {
      observation.messages.push(structuredClone(event.data));
      if (observation.messages.length > 100) observation.messages.shift();
    }
  });
  window.fetch = async (...args) => {
    let request;
    try {
      request = JSON.parse(args[1]?.body);
    } catch {}
    const method = request?.method;
    if (!['botharness/channelGenuiViewSave', 'botharness/channelSend'].includes(method))
      return original(...args);
    const record = { method, messageId: request.payload?.args?.messageId };
    observation.calls.push(record);
    const fault = observation.fault;
    if (fault?.method !== method || fault.used) return original(...args);
    fault.used = true;
    if (fault.mode === 'before-request') throw new TypeError('Synthetic GenUI transport refusal');
    if (fault.mode !== 'after-commit') throw new Error('Unknown GenUI QA transport fault');
    const response = await original(...args);
    const envelope = await response.clone().json();
    fault.committed = response.ok && envelope?.result?.ok === true;
    fault.refusalCode = envelope?.result?.error?.code;
    if (!fault.committed) throw new Error('The Host did not commit the uncertain-response fixture');
    throw new TypeError('Synthetic GenUI lost response after Host commit');
  };
}
