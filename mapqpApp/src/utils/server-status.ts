// Shared by the startup check and the foreground availability monitor.
let online = false;

export function isServerOnline() {
  return online;
}

export function setServerOnline(value: boolean) {
  online = value;
}
