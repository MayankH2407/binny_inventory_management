import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Alert } from 'react-native';
import React from 'react';

import { useApiQuery, useApiMutation } from '../../hooks/useApi';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a fresh QueryClient + wrapper for every test so caches don't bleed. */
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
};

// ---------------------------------------------------------------------------
// useApiQuery
// ---------------------------------------------------------------------------
describe('useApiQuery', () => {
  it('calls queryFn and returns data on success', async () => {
    const queryFn = jest.fn().mockResolvedValue({ id: 1, name: 'Test' });

    const { result } = renderHook(
      () => useApiQuery(['test-data'], queryFn),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual({ id: 1, name: 'Test' });
  });

  it('returns isLoading=true initially before the query resolves', async () => {
    // Use a promise that never resolves so we can observe the loading state
    const queryFn = jest.fn().mockImplementation(() => new Promise(() => {}));

    const { result } = renderHook(
      () => useApiQuery(['loading-test'], queryFn),
      { wrapper: createWrapper() },
    );

    // On first render the query is in loading state (isPending in v5, but
    // react-query v4 exposes isLoading which covers this)
    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
  });

  it('returns error on queryFn failure', async () => {
    const error = new Error('Network error');
    const queryFn = jest.fn().mockRejectedValue(error);

    const { result } = renderHook(
      () => useApiQuery(['error-test'], queryFn),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBe(error);
    expect(result.current.data).toBeUndefined();
  });

  it('passes additional options to useQuery', async () => {
    const queryFn = jest.fn().mockResolvedValue(['a', 'b']);

    const { result } = renderHook(
      () =>
        useApiQuery(['opts-test'], queryFn, {
          select: (data: string[]) => data.length as unknown as string[],
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// useApiMutation
// ---------------------------------------------------------------------------
describe('useApiMutation', () => {
  beforeEach(() => {
    jest.spyOn(Alert, 'alert');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('calls mutationFn with the provided variables', async () => {
    const mutationFn = jest.fn().mockResolvedValue({ ok: true });

    const { result } = renderHook(
      () => useApiMutation(mutationFn),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      result.current.mutate({ payload: 'data' } as any);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mutationFn).toHaveBeenCalledWith({ payload: 'data' });
  });

  it('shows Alert.alert with "Success" title when successMessage is provided', async () => {
    const mutationFn = jest.fn().mockResolvedValue({ ok: true });

    const { result } = renderHook(
      () =>
        useApiMutation(mutationFn, {
          successMessage: 'Item saved successfully!',
        }),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      result.current.mutate(undefined as any);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(Alert.alert).toHaveBeenCalledWith('Success', 'Item saved successfully!');
  });

  it('does not show success Alert when successMessage is not provided', async () => {
    const mutationFn = jest.fn().mockResolvedValue({ ok: true });

    const { result } = renderHook(
      () => useApiMutation(mutationFn),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      result.current.mutate(undefined as any);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // Alert should not be called for success with no message
    expect(Alert.alert).not.toHaveBeenCalledWith('Success', expect.any(String));
  });

  it('shows Alert.alert with "Error" title when mutation fails', async () => {
    const mutationFn = jest
      .fn()
      .mockRejectedValue(new Error('Something went wrong'));

    const { result } = renderHook(
      () => useApiMutation(mutationFn),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      result.current.mutate(undefined as any);
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(Alert.alert).toHaveBeenCalledWith('Error', 'Something went wrong');
  });

  it('uses custom errorMessage when provided instead of the thrown message', async () => {
    const mutationFn = jest
      .fn()
      .mockRejectedValue(new Error('Internal error'));

    const { result } = renderHook(
      () =>
        useApiMutation(mutationFn, {
          errorMessage: 'Could not save. Please try again.',
        }),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      result.current.mutate(undefined as any);
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(Alert.alert).toHaveBeenCalledWith(
      'Error',
      'Could not save. Please try again.',
    );
  });

  it('invalidates the specified query keys on success', async () => {
    const mutationFn = jest.fn().mockResolvedValue({ ok: true });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        children,
      );

    const { result } = renderHook(
      () =>
        useApiMutation(mutationFn, {
          invalidateKeys: [['items'], ['summary']],
        }),
      { wrapper },
    );

    await act(async () => {
      result.current.mutate(undefined as any);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['items'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['summary'] });
  });

  it('calls onSuccess callback with the returned data', async () => {
    const responseData = { id: 42, status: 'created' };
    const mutationFn = jest.fn().mockResolvedValue(responseData);
    const onSuccess = jest.fn();

    const { result } = renderHook(
      () => useApiMutation(mutationFn, { onSuccess }),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      result.current.mutate(undefined as any);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(onSuccess).toHaveBeenCalledWith(responseData);
  });

  it('calls onError callback when mutation fails', async () => {
    const error = new Error('Failure');
    const mutationFn = jest.fn().mockRejectedValue(error);
    const onError = jest.fn();

    const { result } = renderHook(
      () => useApiMutation(mutationFn, { onError }),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      result.current.mutate(undefined as any);
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(onError).toHaveBeenCalledWith(error);
  });
});
