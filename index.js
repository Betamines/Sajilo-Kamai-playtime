const express = require('express');
const crypto = require('crypto');
const admin = require('firebase-admin');
const app = express();
const PORT = process.env.PORT || 3000;

// १. Firebase Admin SDK - आधिकारिक र सुरक्षित कनेक्सन
if (admin.apps.length === 0) {
    admin.initializeApp({
        databaseURL: "https://sajilokamai-72496-default-rtdb.firebaseio.com"
    });
}
const db = admin.database();

// तपाईंको एकाउन्टको साँचोहरू (Keys)
const APP_KEY = "616ffcd94caa04ea";
const SECRET_KEY = "YUKDWKH2N5RGP8L2QKW13OPBTW6D1O"; 

// मुख्य पोस्टब्याक रूट (Endpoint)
app.get('/postback', async (req, res) => {
    let { 
        user_id, 
        offer_id, 
        offer_name, 
        payout, 
        event, 
        signature, 
        amount, 
        conversionDatetime, 
        clickIp,
        currency_name
    } = req.query;

    // आधारभूत जाँच (कम्तीमा आवश्यक प्यारामिटरहरू हुनुपर्छ)
    if (!user_id || !offer_id || !amount || !event) {
        console.log("[Error] Missing required parameters in query.");
        return res.status(400).send("Missing parameters");
    }

    // २. कडा सुरक्षा जाँच (Signature Validation)
    // यदि प्लेटाइमको टेस्ट टूल (TEST_) होइन भने मात्र सिग्नेचर कडा रूपमा चेक गर्ने
    if (!user_id.startsWith("TEST_")) {
        if (!signature) {
            console.log("[Warning] Blocked: Missing signature from live request.");
            return res.status(400).send("Missing signature");
        }

        // डाटाहरूलाई सुरक्षित रूपमा स्ट्रिङमा ढाल्ने (क्र्यास रोक्न)
        const strUser = String(user_id);
        const strOffer = String(offer_id);
        const strEvent = String(event);

        const dataToHash = `${strUser}${strOffer}${strEvent}${APP_KEY}${SECRET_KEY}`;
        const calculatedSignature = crypto.createHash('sha1').update(dataToHash).digest('hex');

        if (signature !== calculatedSignature) {
            console.log(`[Warning] Security block: Invalid signature hash for User: ${user_id}`);
            return res.status(403).send("Invalid Signature. Request blocked.");
        }
    } else {
        console.log(`[Info] Test callback detected. Bypassing signature check for Playtime testing.`);
    }

    // ३. टेस्ट आईडी व्यवस्थापन (TEST_ हटाउने ताकि सही युजर खाता भेटियोस्)
    if (user_id.startsWith("TEST_")) {
        user_id = user_id.replace("TEST_", "");
    }

    try {
        // ४. कोइन अमाउन्टको डाटा टाइप सुरक्षित व्यवस्थापन
        const rewardAmount = Math.floor(Number(amount));

        if (isNaN(rewardAmount) || rewardAmount <= 0) {
            console.log(`[Error] Invalid coin amount type: ${amount}`);
            return res.status(400).send("Invalid amount");
        }

        const userRef = db.ref(`users/${user_id}`);
        const historyRef = db.ref(`users/${user_id}/history`);

        // ५. Firebase Transaction (डेटा हराउने वा नलेखिने समस्या सधैँका लागि बन्द)
        await userRef.child('balance').transaction((currentBalance) => {
            return (currentBalance || 0) + rewardAmount;
        });

        // ६. अफरको विस्तृत विवरण 'history' भित्र सुरक्षित राख्ने
        await historyRef.push({
            offer_id: String(offer_id),
            offer_name: offer_name || "Playtime Task Completion",
            payout_usd: payout || "0.00",
            amount_credited: rewardAmount,
            event_type: String(event),
            date_time: conversionDatetime || new Date().toISOString(),
            user_ip: clickIp || "0.0.0.0",
            currency: currency_name || "Coin",
            status: "Success",
            timestamp: admin.database.ServerValue.TIMESTAMP // सर्भरको वास्तविक समय
        });

        console.log(`[Success] Permanent Fix Active! Added +${rewardAmount} coins to User: ${user_id}`);
        return res.status(200).send("OK");

    } catch (error) {
        console.error("Firebase Database Operation Error:", error);
        return res.status(500).send("Internal Server Error");
    }
});

app.listen(PORT, () => {
    console.log(`Permanent & Secured Postback server is fully live on port ${PORT}`);
});
