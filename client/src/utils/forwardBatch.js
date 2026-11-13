// Each opening owns a distinct lifetime, including A -> B -> A on one chat.
export function createForwardBatchOwner() {
  let current = null, serial = 0;
  return {
    open(sourceKey, messageIds) {
      const ids = [...new Set(messageIds.map(Number))].sort((a,b)=>a-b);
      current = { ids, key: `forward:${sourceKey}:${ids.join(',')}:${++serial}` };
      return current;
    },
    isCurrent(batch) { return batch != null && current === batch; },
    close(batch) {
      if (batch && current !== batch) return false;
      current = null;
      return true;
    },
  };
}
