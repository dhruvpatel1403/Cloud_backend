import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import ddb from "../dynamo.js";


export const getMyProfile = async (req, res) => {
  try {
    console.log("Authenticated user:", req.user);

    const userId = req.user.userId; // or req.user.sub
    const role = req.user.role;     // IMPORTANT

    const result = await ddb.send(
      new GetCommand({
        TableName: process.env.USERS_TABLE,
        Key: {
          userId,
          role
        },
      })
    );

    if (!result.Item) {
      return res.status(404).json({ message: "Profile not found" });
    }

    return res.status(200).json({
      success: true,
      profile: result.Item,
    });
  } catch (err) {
    console.error("Get profile error:", err);
    return res.status(500).json({
      message: "Failed to fetch profile",
    });
  }
};



export const updateMyProfile = async (req, res) => {
  try {
    const userId = req.user.userId;
    const role = req.user.role;
    const { 
      name, 
      avatar, 
      storeName, 
      phone, 
      address, 
      city, 
      state, 
      zipCode, 
      country,
      // Store-specific fields
      storeDescription,
      storeAddress,
      storeCity,
      storeState,
      storeZipCode,
      storeCountry
    } = req.body;

    const updateExp = [];
    const attrNames = {};
    const attrValues = {};

    if (name) {
      updateExp.push("#n = :n");
      attrNames["#n"] = "name";
      attrValues[":n"] = name;
    }

    if (avatar) {
      updateExp.push("avatar = :a");
      attrValues[":a"] = avatar;
    }

    if (storeName) {
      updateExp.push("storeName = :s");
      attrValues[":s"] = storeName;
    }

    if (phone) {
      updateExp.push("phone = :p");
      attrValues[":p"] = phone;
    }

    // Customer address fields
    if (address) {
      updateExp.push("address = :addr");
      attrValues[":addr"] = address;
    }

    if (city) {
      updateExp.push("city = :c");
      attrValues[":c"] = city;
    }

    if (state) {
      updateExp.push("#st = :st");
      attrNames["#st"] = "state";
      attrValues[":st"] = state;
    }

    if (zipCode) {
      updateExp.push("zipCode = :z");
      attrValues[":z"] = zipCode;
    }

    if (country) {
      updateExp.push("country = :co");
      attrValues[":co"] = country;
    }

    // Store-specific fields
    if (storeDescription) {
      updateExp.push("storeDescription = :sd");
      attrValues[":sd"] = storeDescription;
    }

    if (storeAddress) {
      updateExp.push("storeAddress = :sa");
      attrValues[":sa"] = storeAddress;
    }

    if (storeCity) {
      updateExp.push("storeCity = :sc");
      attrValues[":sc"] = storeCity;
    }

    if (storeState) {
      updateExp.push("storeState = :ss");
      attrValues[":ss"] = storeState;
    }

    if (storeZipCode) {
      updateExp.push("storeZipCode = :sz");
      attrValues[":sz"] = storeZipCode;
    }

    if (storeCountry) {
      updateExp.push("storeCountry = :sco");
      attrValues[":sco"] = storeCountry;
    }

    updateExp.push("updatedAt = :u");
    attrValues[":u"] = new Date().toISOString();

    if (updateExp.length === 1) {
      return res.status(400).json({ message: "No fields to update" });
    }

    await ddb.send(
  new UpdateCommand({
    TableName: process.env.USERS_TABLE,
    Key: {
      userId,
      role
    },
    UpdateExpression: `SET ${updateExp.join(", ")}`,
    ExpressionAttributeNames: Object.keys(attrNames).length ? attrNames : undefined,
    ExpressionAttributeValues: attrValues,
  })
);


    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
    });
  } catch (err) {
    console.error("Update profile error:", err);
    return res.status(500).json({
      message: "Failed to update profile",
    });
  }
};