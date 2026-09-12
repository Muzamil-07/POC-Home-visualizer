let returnToken = 0;
let cancelToken = 0;

export function requestReturnToEntrance() {
  returnToken += 1;
  return returnToken;
}

export function requestCancelExploration() {
  cancelToken += 1;
  return cancelToken;
}

export function currentReturnToken() {
  return returnToken;
}

export function currentCancelToken() {
  return cancelToken;
}
