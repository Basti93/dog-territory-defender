/** RFC 4122 v4-shaped id for outbox items / command clientIds. Math.random is fine: ids only need to be unique per household, not unguessable. */
export function newClientId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
