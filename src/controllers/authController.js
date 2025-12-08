// src/controllers/authController.js
import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  ConfirmSignUpCommand,
  InitiateAuthCommand,
  AuthFlowType,
} from '@aws-sdk/client-cognito-identity-provider';

const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION,
});

// --------------------- REGISTER ---------------------
export const register = async (req, res) => {
  const { email, password, role } = req.body;

  if (!email || !password || !role) {
    return res.status(400).json({ message: 'Email, password, and role are required' });
  }

  const clientId = process.env.COGNITO_CLIENT_ID_USERS;

  try {
    const signUpCommand = new SignUpCommand({
      ClientId: clientId,
      Username: email,
      Password: password,
      UserAttributes: [
        { Name: 'email', Value: email },
        { Name: 'custom:role', Value: role },
      ],
    });

    const signUpResponse = await cognitoClient.send(signUpCommand);

    return res.status(201).json({
      message: 'User registered successfully. Please check your email for OTP to confirm.',
      userSub: signUpResponse.UserSub,
    });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ message: 'Registration failed', error: err.message });
  }
};

// --------------------- CONFIRM OTP ---------------------
export const confirmUser = async (req, res) => {
  const { email, code } = req.body;

  if (!email || !code) {
    return res.status(400).json({ message: 'Email and OTP code are required' });
  }

  const clientId = process.env.COGNITO_CLIENT_ID_USERS;

  try {
    const confirmCommand = new ConfirmSignUpCommand({
      ClientId: clientId,
      Username: email,
      ConfirmationCode: code,
    });

    await cognitoClient.send(confirmCommand);

    return res.status(200).json({ message: 'User confirmed successfully' });
  } catch (err) {
    console.error('Confirm error:', err);
    return res.status(400).json({ message: 'Confirmation failed', error: err.message });
  }
};

// --------------------- LOGIN ---------------------
export const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  const clientId = process.env.COGNITO_CLIENT_ID_USERS;

  try {
    const authCommand = new InitiateAuthCommand({
      ClientId: clientId,
      AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password,
      },
    });

    const authResponse = await cognitoClient.send(authCommand);

    if (!authResponse.AuthenticationResult) {
      return res.status(401).json({ message: 'Authentication failed' });
    }

    const { IdToken, AccessToken, RefreshToken, ExpiresIn, TokenType } =
      authResponse.AuthenticationResult;

    // Parse ID token manually (no jwt-decode needed)
    const idTokenPayload = JSON.parse(Buffer.from(IdToken.split('.')[1], 'base64').toString());
    const userRole = idTokenPayload['custom:role'] || 'users';

    return res.status(200).json({
      message: 'Login successful',
      role: userRole,
      accessToken: AccessToken,
      idToken: IdToken,
      refreshToken: RefreshToken,
      expiresIn: ExpiresIn,
      tokenType: TokenType,
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(401).json({ message: 'Invalid email or password', error: err.message });
  }
};
