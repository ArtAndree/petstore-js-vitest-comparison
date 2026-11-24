const BASE_URL = (process.env.PETSTORE_BASE_URL || 'https://petstore.swagger.io/v2').replace(/\/$/, '');
let sequence = 0;

function uniqueSuffix() {
  sequence += 1;
  return `${Date.now().toString(36)}-${process.pid}-${sequence}`;
}

function uniqueId() {
  sequence += 1;
  return Date.now() * 1000 + sequence;
}

async function requestJson(path, { method = 'GET', body } = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const text = await response.text();
  let data = text;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      // Keep plain-text responses available for useful assertions.
    }
  } else {
    data = null;
  }
  return { status: response.status, data };
}

function makePet(variant = 'standard') {
  const id = uniqueId();
  const suffix = uniqueSuffix();
  const pet = {
    id,
    category: { id: 1, name: 'dogs' },
    name: `codex-pet-${suffix}`,
    photoUrls: ['https://example.com/pet.png'],
    tags: [{ id: 1, name: `tag-${suffix}` }],
    status: 'available',
  };
  if (variant === 'cat') {
    pet.category = { id: 2, name: 'cats' };
    pet.name = `codex-cat-${suffix}`;
  }
  if (variant === 'no-tags') pet.tags = [];
  if (variant === 'pending') pet.status = 'pending';
  if (variant === 'sold') pet.status = 'sold';
  return pet;
}

async function createPet(expect, variant = 'standard') {
  const pet = makePet(variant);
  const result = await requestJson('/pet', { method: 'POST', body: pet });
  expect(result.status).toBe(200);
  expect(result.data).toMatchObject({ id: pet.id, name: pet.name });
  return pet;
}

function makeOrder(variant = 'placed') {
  const id = uniqueId();
  return {
    id,
    petId: 1,
    quantity: variant === 'single' ? 1 : 2,
    shipDate: new Date().toISOString(),
    status: variant === 'approved' ? 'approved' : 'placed',
    complete: variant === 'complete',
  };
}

async function createOrder(expect, variant) {
  const order = makeOrder(variant);
  const result = await requestJson('/store/order', { method: 'POST', body: order });
  expect(result.status).toBe(200);
  expect(result.data).toMatchObject({ id: order.id, petId: order.petId, quantity: order.quantity });
  return order;
}

function makeUser() {
  const suffix = uniqueSuffix();
  return {
    id: Number(String(Date.now()).slice(-8)) + sequence,
    username: `codex_${suffix}`,
    firstName: 'Codex',
    lastName: 'Test',
    email: `codex-${suffix}@example.com`,
    password: `Pass-${suffix}-1!`,
    phone: '5550100',
    userStatus: 1,
  };
}

async function createUser(expect) {
  const user = makeUser();
  const result = await requestJson('/user', { method: 'POST', body: user });
  expect(result.status).toBe(200);
  expect(result.data).toMatchObject({ code: 200 });
  return user;
}

module.exports = function registerPetstoreSuite({ describe, test, expect }) {
  describe('Pet API', () => {
    test.each(['available', 'pending', 'sold'])(
      'findByStatus returns an array for status %s',
      async (status) => {
        const result = await requestJson(`/pet/findByStatus?status=${status}`);
        expect(result.status).toBe(200);
        expect(Array.isArray(result.data)).toBe(true);
      },
    );

    test.each(['standard', 'cat', 'no-tags', 'pending', 'sold'])(
      'creates a %s pet',
      async (variant) => {
        const pet = makePet(variant);
        const result = await requestJson('/pet', { method: 'POST', body: pet });
        expect(result.status).toBe(200);
        expect(result.data).toMatchObject({ id: pet.id, name: pet.name });
      },
    );

    test.each(['standard', 'cat', 'pending'])(
      'retrieves a created %s pet by id',
      async (variant) => {
        const pet = await createPet(expect, variant);
        const result = await requestJson(`/pet/${pet.id}`);
        expect(result.status).toBe(200);
        expect(result.data).toMatchObject({ id: pet.id, name: pet.name });
      },
    );

    test('returns 404 for a pet id that was not created', async () => {
      const result = await requestJson(`/pet/${uniqueId()}`);
      expect(result.status).toBe(404);
      expect(result.data).toMatchObject({ code: 1, type: 'error' });
    });

    test.each(['renamed', 'pending', 'sold'])(
      'updates a pet to the %s variant',
      async (variant) => {
        const pet = await createPet(expect);
        const updatedPet = {
          ...pet,
          name: `codex-${variant}-${uniqueSuffix()}`,
          status: variant === 'renamed' ? 'available' : variant,
        };
        const update = await requestJson('/pet', { method: 'PUT', body: updatedPet });
        expect(update.status).toBe(200);
        const readBack = await requestJson(`/pet/${pet.id}`);
        expect(readBack.status).toBe(200);
        expect(readBack.data).toMatchObject({ id: pet.id, name: updatedPet.name, status: updatedPet.status });
      },
    );

    test.each(['primary', 'secondary'])(
      'finds a pet by its %s tag',
      async (tagKind) => {
        const pet = makePet();
        pet.tags = [{ id: tagKind === 'primary' ? 901 : 902, name: `codex-${tagKind}-${uniqueSuffix()}` }];
        const created = await requestJson('/pet', { method: 'POST', body: pet });
        expect(created.status).toBe(200);
        const result = await requestJson(`/pet/findByTags?tags=${encodeURIComponent(pet.tags[0].name)}`);
        expect(result.status).toBe(200);
        expect(Array.isArray(result.data)).toBe(true);
        expect(result.data.some((item) => item.id === pet.id)).toBe(true);
      },
    );

    test.each(['first', 'second'])(
      'deletes a created pet (%s cleanup case)',
      async () => {
        const pet = await createPet(expect);
        const result = await requestJson(`/pet/${pet.id}`, { method: 'DELETE' });
        expect(result.status).toBe(200);
      },
    );
  });

  describe('Store API', () => {
    test('returns inventory counts as numeric values', async () => {
      const result = await requestJson('/store/inventory');
      expect(result.status).toBe(200);
      expect(result.data).toEqual(expect.objectContaining({}));
      expect(Object.keys(result.data).length).toBeGreaterThan(0);
      for (const count of Object.values(result.data)) expect(typeof count).toBe('number');
    });

    test.each(['placed', 'approved', 'complete', 'single', 'second-order'])(
      'creates a %s order',
      async (variant) => {
        const order = makeOrder(variant);
        const result = await requestJson('/store/order', { method: 'POST', body: order });
        expect(result.status).toBe(200);
        expect(result.data).toMatchObject({ id: order.id, petId: order.petId, quantity: order.quantity });
      },
    );

    test.each(['placed', 'approved'])(
      'reads a created %s order',
      async (variant) => {
        const order = await createOrder(expect, variant);
        const result = await requestJson(`/store/order/${order.id}`);
        expect(result.status).toBe(200);
        expect(result.data).toMatchObject({ id: order.id, petId: order.petId });
      },
    );

    test.each(['first', 'second'])(
      'deletes a created order (%s cleanup case)',
      async () => {
        const order = await createOrder(expect, 'placed');
        const result = await requestJson(`/store/order/${order.id}`, { method: 'DELETE' });
        expect(result.status).toBe(200);
      },
    );

    test('returns 404 for an order id that was not created', async () => {
      const result = await requestJson(`/store/order/${uniqueId()}`);
      expect(result.status).toBe(404);
      expect(result.data).toMatchObject({ code: 1, type: 'error' });
    });
  });

  describe('User API', () => {
    test.each(['first', 'second'])(
      'creates a user (%s data case)',
      async () => {
        await createUser(expect);
      },
    );

    test.each(['first', 'second'])(
      'gets a created user (%s lookup case)',
      async () => {
        const user = await createUser(expect);
        const result = await requestJson(`/user/${encodeURIComponent(user.username)}`);
        expect(result.status).toBe(200);
        expect(result.data).toMatchObject({ username: user.username, email: user.email });
      },
    );

    test('updates a user and reads the changed email', async () => {
      const user = await createUser(expect);
      const updatedUser = { ...user, email: `updated-${uniqueSuffix()}@example.com` };
      const update = await requestJson(`/user/${encodeURIComponent(user.username)}`, {
        method: 'PUT',
        body: updatedUser,
      });
      expect(update.status).toBe(200);
      const readBack = await requestJson(`/user/${encodeURIComponent(user.username)}`);
      expect(readBack.status).toBe(200);
      expect(readBack.data.email).toBe(updatedUser.email);
    });

    test('deletes a created user', async () => {
      const user = await createUser(expect);
      const result = await requestJson(`/user/${encodeURIComponent(user.username)}`, { method: 'DELETE' });
      expect(result.status).toBe(200);
    });

    test('logs in a created user and checks the response message', async () => {
      const user = await createUser(expect);
      const query = new URLSearchParams({ username: user.username, password: user.password });
      const result = await requestJson(`/user/login?${query}`);
      expect(result.status).toBe(200);
      expect(result.data).toMatchObject({ code: 200, type: 'unknown' });
      expect(result.data.message).toContain('logged in user session');
    });

    test('logs out and receives a successful response', async () => {
      const result = await requestJson('/user/logout');
      expect(result.status).toBe(200);
      expect(result.data).toMatchObject({ code: 200, type: 'unknown' });
    });
  });
};
