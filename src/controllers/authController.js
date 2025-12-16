// src/controllers/authController.js
import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  ConfirmSignUpCommand,
  InitiateAuthCommand,
  AuthFlowType,
} from '@aws-sdk/client-cognito-identity-provider';
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import ddb from "../dynamo.js";

import { publishEvent } from '../services/snsPublisher.js';

const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION,
});

// --------------------- REGISTER ---------------------
export const register = async (req, res) => {
  const { email, password, role } = req.body;

  if (!email || !password || !role) {
    return res.status(400).json({
      message: "Email, password, and role are required",
    });
  }

  const clientId = process.env.COGNITO_CLIENT_ID_USERS;
  const USERS_TABLE = process.env.USERS_TABLE;

  try {
    // 1️⃣ Register user in Cognito
    const signUpCommand = new SignUpCommand({
      ClientId: clientId,
      Username: email,
      Password: password,
      UserAttributes: [
        { Name: "email", Value: email },
        { Name: "custom:role", Value: role },
      ],
    });

    const signUpResponse = await cognitoClient.send(signUpCommand);

    const userId = signUpResponse.UserSub;

    // 2️⃣ Save user profile in DynamoDB
    const userItem = {
      userId,
      email,
      role,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await ddb.send(
      new PutCommand({
        TableName: USERS_TABLE,
        Item: userItem,
        ConditionExpression: "attribute_not_exists(userId)",
      })
    );

    // 3️⃣ Optional: Publish SNS event
    await publishEvent({
  toEmail: email,
  subject: "Registration Successful",
  body: `Welcome! Your account has been created successfully.`,
});


    return res.status(201).json({
      success: true,
      message:
        "User registered successfully. Please check your email for OTP to confirm.",
      userSub: userId,
    });
  } catch (err) {
    console.error("Register error:", err);

    // Handle duplicate user gracefully
    if (err.name === "ConditionalCheckFailedException") {
      return res.status(409).json({ message: "User already exists" });
    }

    return res.status(500).json({
      message: "Registration failed",
      error: err.message,
    });
  }
};


// --------------------- CONFIRM OTP ---------------------
export const confirmUser = async (req, res) => {
  const { email, code } = req.body;

  if (!email || !code) {
    return res.status(400).json({
      message: 'Email and OTP code are required',
    });
  }

  const clientId = process.env.COGNITO_CLIENT_ID_USERS;

  try {
    const confirmCommand = new ConfirmSignUpCommand({
      ClientId: clientId,
      Username: email,
      ConfirmationCode: code,
    });

    await cognitoClient.send(confirmCommand);

    // 🔔 Publish SNS event (CONFIRMED)
    await publishEvent({
      toEmail: email,
      subject: "Confirmation Successful",
      body: `Your account has been confirmed successfully.`,
    });

    return res.status(200).json({
      success: true,
      message: 'User confirmed successfully',
    });
  } catch (err) {
    console.error('Confirm error:', err);
    return res.status(400).json({
      message: 'Confirmation failed',
      error: err.message,
    });
  }
};

// --------------------- LOGIN ---------------------
export const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      message: 'Email and password are required',
    });
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
      return res.status(401).json({
        message: 'Authentication failed',
      });
    }

    const {
      IdToken,
      AccessToken,
      RefreshToken,
      ExpiresIn,
      TokenType,
    } = authResponse.AuthenticationResult;

    // Decode ID token
    const idTokenPayload = JSON.parse(
      Buffer.from(IdToken.split('.')[1], 'base64').toString()
    );

    const userRole = idTokenPayload['custom:role'] || 'users';

    // 🔔 Publish SNS event (LOGIN)
    await publishEvent({
      toEmail: email,
      subject: "Login Successful",
      body: `You have logged in successfully.`,
      role: userRole,
    });

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
    return res.status(401).json({
      message: 'Invalid email or password',
      error: err.message,
    });
  }
};
