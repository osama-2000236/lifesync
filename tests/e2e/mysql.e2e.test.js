const request = require('supertest');
const { app } = require('../../server/app');
const db = require('../../server/models');

const shouldRun = process.env.RUN_DB_E2E === 'true';
const suite = shouldRun ? describe : describe.skip;

const {
  sequelize,
  User,
  Category,
  HealthLog,
  FinancialLog,
  LinkedDomain,
  AISummary,
  ChatLog,
  UserGoal,
  SystemLog,
} = db;

const truncateAllTables = async () => {
  const deleteOrder = [
    LinkedDomain,
    HealthLog,
    FinancialLog,
    AISummary,
    ChatLog,
    UserGoal,
    SystemLog,
    Category,
    User,
  ];

  for (const model of deleteOrder) {
    await model.destroy({ where: {}, force: true });
  }
};

suite('MySQL E2E: auth + health + finance', () => {
  let token = '';
  const credentials = {
    email: 'mysql-e2e-user@example.com',
    password: 'Password123',
  };

  beforeAll(async () => {
    await sequelize.authenticate();
  });

  beforeEach(async () => {
    await truncateAllTables();

    await User.create({
      username: 'mysql_e2e_user',
      email: credentials.email,
      hashed_password: credentials.password,
      verified_email: true,
      is_active: true,
    });

    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send(credentials);

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body?.data?.accessToken).toBeTruthy();
    token = loginResponse.body.data.accessToken;
  });

  afterAll(async () => {
    await sequelize.close();
  });

  test('logs and retrieves health records against a real MySQL database', async () => {
    const createResponse = await request(app)
      .post('/api/health-logs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'steps',
        value: 4200,
        notes: 'Morning walk',
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body?.data?.entry?.type).toBe('steps');
    expect(Number(createResponse.body?.data?.entry?.value)).toBe(4200);

    const listResponse = await request(app)
      .get('/api/health-logs')
      .set('Authorization', `Bearer ${token}`);

    expect(listResponse.status).toBe(200);
    expect(Array.isArray(listResponse.body?.data)).toBe(true);
    expect(listResponse.body.data).toHaveLength(1);
    expect(listResponse.body?.pagination?.total).toBe(1);
    expect(listResponse.body.data[0].type).toBe('steps');
  });

  test('logs and retrieves finance records against a real MySQL database', async () => {
    const createResponse = await request(app)
      .post('/api/finance')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'expense',
        amount: 25.5,
        currency: 'USD',
        description: 'Lunch',
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body?.data?.entry?.type).toBe('expense');
    expect(Number(createResponse.body?.data?.entry?.amount)).toBe(25.5);

    const listResponse = await request(app)
      .get('/api/finance')
      .set('Authorization', `Bearer ${token}`);

    expect(listResponse.status).toBe(200);
    expect(Array.isArray(listResponse.body?.data)).toBe(true);
    expect(listResponse.body.data).toHaveLength(1);
    expect(listResponse.body?.pagination?.total).toBe(1);
    expect(listResponse.body.data[0].type).toBe('expense');
  });
});
