export function createCounter() {
  let value = 0;
  return () => ++value;
}
