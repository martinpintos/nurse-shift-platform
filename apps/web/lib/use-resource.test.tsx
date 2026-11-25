import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useResource } from "./use-resource";

function controllable() {
  const pending: ((value: string[]) => void)[] = [];
  const load = () =>
    new Promise<string[]>((resolve) => {
      pending.push(resolve);
    });
  return { load, pending };
}

describe("useResource", () => {
  it("loads, then applies a mutation at once", async () => {
    const { load, pending } = controllable();
    const { result } = renderHook(() => useResource(load));
    expect(result.current.loading).toBe(true);

    await act(async () => pending[0]?.(["shift-1 open"]));
    expect(result.current.data).toEqual(["shift-1 open"]);

    act(() => result.current.mutate(() => ["shift-1 filled"]));
    expect(result.current.data).toEqual(["shift-1 filled"]);
  });

  it("drops a load that was in flight when the mutation landed", async () => {
    const { load, pending } = controllable();
    const { result } = renderHook(() => useResource(load));
    await act(async () => pending[0]?.(["shift-1 open"]));

    // A poll starts, the user claims, then the stale poll answers.
    act(() => result.current.reload());
    await waitFor(() => expect(pending).toHaveLength(2));
    act(() => result.current.mutate(() => ["shift-1 filled"]));
    await act(async () => pending[1]?.(["shift-1 open"]));

    expect(result.current.data).toEqual(["shift-1 filled"]);

    // The next load after the mutation lands normally.
    act(() => result.current.reload());
    await waitFor(() => expect(pending).toHaveLength(3));
    await act(async () => pending[2]?.(["shift-1 filled", "shift-4 open"]));
    expect(result.current.data).toEqual(["shift-1 filled", "shift-4 open"]);
  });

  it("ignores a mutation before the first load has data", async () => {
    const { load, pending } = controllable();
    const { result } = renderHook(() => useResource(load));
    act(() => result.current.mutate(() => ["never"]));
    expect(result.current.data).toBeUndefined();
    await act(async () => pending[0]?.(["loaded"]));
    expect(result.current.data).toBeUndefined();
  });
});
