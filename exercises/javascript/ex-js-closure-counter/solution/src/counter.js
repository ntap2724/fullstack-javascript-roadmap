export function createCounter() {
  let value = 0;
  return function next() {
    value += 1;
    return value;
  };
}
