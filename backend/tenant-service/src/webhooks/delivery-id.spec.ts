import { deliveryIdFor, uuidV5 } from './delivery-id';

describe('delivery ids', () => {
  it('computes RFC 4122 version 5 UUIDs', () => {
    // The RFC's DNS namespace, and the value every uuid library gives for this name.
    expect(
      uuidV5('www.example.com', '6ba7b810-9dad-11d1-80b4-00c04fd430c8'),
    ).toBe('2ed6657d-e927-568b-95e1-2665a8aea6a2');
  });

  it('gives every attempt of one activity the same UUID, and other activities another', () => {
    const id = deliveryIdFor('liftoff-webhook-d-1/1');

    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(deliveryIdFor('liftoff-webhook-d-1/1')).toBe(id);
    expect(deliveryIdFor('liftoff-webhook-d-2/1')).not.toBe(id);
  });
});
