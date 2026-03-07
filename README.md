# Christian Spyfall

A Christian-themed version of the popular party game "Spyfall," designed for youth groups, families, and friends to play together using their smartphones.

## 🎮 What is Spyfall?
Spyfall is a social deduction game. In this Christian edition, players are assigned a location (e.g., "Noah's Ark", "Garden of Gethsemane", "Golgotha") and a specific role within that location. However, one player is secretly the "Spy" and does not know the location! 

Players take turns asking each other questions to identify the Spy, while the Spy tries to figure out the location without giving away their identity. 

## 🚀 Features
* **Multiplayer:** Real-time gameplay via websockets.
* **Mobile-Friendly:** Designed primarily for smartphones so everyone can easily play using their own device.
* **Christian Themes:** 10 unique Biblical locations with distinct roles for each.
* **Easy Hosting:** Run the server on a computer, and everyone on the same Wi-Fi network can join instantly via the provided local IP link.

## 🛠️ Technologies Used
* **Backend:** Python, Flask, Flask-SocketIO, Eventlet
* **Frontend:** HTML, JavaScript (Socket.io client), Tailwind CSS (for styling), FontAwesome

## 📋 Prerequisites
* Python 3.7 or higher
* pip (Python package installer)

## ⚙️ Installation

1. **Clone or Download the Repository**
2. **Navigate to the Project Directory**
   Ensure you are in the root directory where `app.py` is located.
3. **Install Dependencies**
   Run the following command to install required Python packages:
   ```bash
   pip install -r requirements.txt
   ```

## 🕹️ How to Run & Play

1. **Start the Server**
   Run the application using Python:
   ```bash
   python app.py
   ```
2. **Host the Game**
   The terminal will output local IP addresses. Look for the message similar to:
   ```
   📱 Play on phones (same Wi-Fi): http://192.168.x.x:5000
   ```
3. **Join & Play**
   * Have all players connect to the same Wi-Fi network as the host computer.
   * Players open the provided link on their phone browsers.
   * One person creates a game, generating a 4-letter Room Code.
   * Other players use the Room Code to join the lobby.
   * Once everyone is in, the host starts the game!

## 📜 Locations
* Garden of Gethsemane
* Noah's Ark
* The Red Sea
* Mount Sinai
* Jericho
* Solomon's Temple
* Bethlehem Manger
* Golgotha
* The Upper Room
* The Empty Tomb
