//lovely-right-magic-breeze
require("dotenv").config();

const express = require("express");
const Stripe = require("stripe");
const path = require("path");

const app = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const PORT = process.env.PORT || 3000;

// Fake database for learning.
// In a real app, this would be PostgreSQL, Firebase, MongoDB, etc.
const users = {
  "ram@example.com": {
    email: "ram@example.com",
    subscriptionStatus: "free",
    stripeCustomerId: null,
    stripeSubscriptionId: null,
  },
};

// IMPORTANT:
// The webhook route needs raw body, so it must be defined BEFORE express.json().
app.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["stripe-signature"];

    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error("Webhook signature verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    console.log("Webhook received:", event.type);

    try {
      if (event.type === "checkout.session.completed") {
        const session = event.data.object;

        const email = session.customer_details?.email;

        if (email && users[email]) {
          users[email].subscriptionStatus = "active";
          users[email].stripeCustomerId = session.customer;
          users[email].stripeSubscriptionId = session.subscription;

          console.log("User upgraded to premium:", users[email]);
        }
      }

      if (event.type === "customer.subscription.deleted") {
        const subscription = event.data.object;

        const user = Object.values(users).find(
          (u) => u.stripeSubscriptionId === subscription.id
        );

        if (user) {
          user.subscriptionStatus = "canceled";
          console.log("User subscription canceled:", user);
        }
      }

      res.sendStatus(200);
    } catch (err) {
      console.error("Webhook handling failed:", err);
      res.sendStatus(500);
    }
  }
);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.post("/create-checkout-session", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !users[email]) {
      return res.status(400).json({
        error: "User not found. Try ram@example.com",
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      customer_email: email,
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID,
          quantity: 1,
        },
      ],
      success_url: `${process.env.APP_URL}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.APP_URL}/cancel.html`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("Checkout session creation failed:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/subscription-status", (req, res) => {
  const email = req.query.email;

  if (!email || !users[email]) {
    return res.status(400).json({
      error: "User not found",
    });
  }

  res.json(users[email]);
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});