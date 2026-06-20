const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

const FIREBASE_DB_URL = "https://sajilokamai-72496-default-rtdb.firebaseio.com";

// मुख्य पोस्टब्याक रूट (Endpoint)
app.get('/postback', async (req, res) => {
    const { 
        user_id, 
        offer_id, 
        offer_name, 
        payout, 
        event, 
        amount, 
        conversionDatetime, 
        clickIp,
        currency_name
    } = req.query;

    // युजर आईडी र कोइन अमाउन्ट आएको छ कि छैन मात्र चेक गर्ने
    if (!user_id || !amount) {
        console.log("[Error] Missing user_id or amount.");
        return res.status(400).send("Missing user_id or amount");
    }

    try {
        const rewardAmount = parseInt(amount, 10);

        // १. Firebase बाट युजरको हालको ब्यालेन्स तान्ने
        const userFetchUrl = `${FIREBASE_DB_URL}/users/${user_id}/balance.json`;
        const balanceRes = await fetch(userFetchUrl);
        const currentBalance = await balanceRes.json() || 0;

        // नयाँ ब्यालेन्स हिसाब गर्ने
        const newBalance = currentBalance + rewardAmount;

        // २. Firebase मा नयाँ ब्यालेन्स सिधै अपडेट गर्ने
        await fetch(userFetchUrl, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newBalance)
        });

        // ३. अफरको पुरै विवरण 'history' भित्र थप्ने
        const historyPushUrl = `${FIREBASE_DB_URL}/users/${user_id}/history.json`;
        const historyData = {
            offer_id: offer_id || "Test_ID",
            offer_name: offer_name || "Playtime Task",
            payout_usd: payout || "0.00",
            amount_credited: rewardAmount,
            event_type: event || "conversion",
            date_time: conversionDatetime || new Date().toISOString(),
            user_ip: clickIp || "0.0.0.0",
            currency: currency_name || "Coin",
            status: "Success",
            timestamp: Date.now()
        };

        await fetch(historyPushUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(historyData)
        });

        console.log(`[Success] Updated balance by +${rewardAmount} for User: ${user_id}`);
        return res.status(200).send("OK");

    } catch (error) {
        console.error("Firebase Operation Error:", error);
        return res.status(500).send("Internal Server Error");
    }
});

app.listen(PORT, () => {
    console.log(`Postback server is successfully running on port ${PORT}`);
});
