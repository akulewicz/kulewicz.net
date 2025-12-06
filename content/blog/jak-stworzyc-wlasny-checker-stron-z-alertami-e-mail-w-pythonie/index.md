+++
title = 'Jak stworzyć własny checker stron z alertami e-mail w Pythonie'
date = 2025-12-03T11:00:46+01:00
draft = false
avatar = "/images/avatar.webp"
description = "Pomimo wyboru jak najmniej awaryjnych rozwiązań zdarza się, że któraś z moich stron WWW przestanie działać. Ostatnio taka sytuacja miała miejsce dwa tygodnie temu, kiedy awaria Cloudflare wywaliła w kosmos dużą część internetu, w tym moją stronę. O ile to moja prywatna strona, to świat się nie zawali. Ale w przypadku stron służbowych chciałbym wiedzieć, że coś nie gra. Stąd potrzeba wdrożenia systemu monitoringu."
author = "Arkadiusz Kulewicz"
image = ""
categories = ["automatyzacja"]
+++

Pomimo wyboru jak najmniej awaryjnych rozwiązań zdarza się, że któraś z moich stron WWW przestanie działać. Ostatnio taka sytuacja miała miejsce dwa tygodnie temu, kiedy awaria Cloudflare wywaliła w kosmos dużą część internetu, w tym moją stronę. O ile to moja prywatna strona, to świat się nie zawali. Ale w przypadku stron służbowych chciałbym wiedzieć, że coś nie gra. Stąd potrzeba wdrożenia systemu monitoringu. 

Co prawda gotowych narzędzi na rynku nie brakuje, ale ja chciałem czegoś lekkiego, prostego i w pełni kontrolowanego. Dlatego napisałem własny monitor w Pythonie, który:

- regularnie sprawdza, czy wybrane strony działają,
- zapisuje ich status w pliku JSON,
- loguje zdarzenia,
- wysyła powiadomienia e-mail, gdy coś się zmieni (awaria lub powrót do działania).

## Co jest najważniejsze w logice działania programu?

Przyznam, że początkowo program wydawał mi się bardzo trywialny. Ale po kilkunastu linijkach kodu wiedziałem, że tak prosto to nie będzie. Problem polegał na tym, że program przy każdym uruchomieniu wysyłał powiadomienie, bez względu na to, czy status strony zmienił się, czy nie. I w tym momencie wystarczy wyobrazić sobie sytuację, że awaria trwa 4 godziny, a program wysyła co minutę informację, że strona nie działa... Dlatego musiałem przerobić program w ten sposób, aby nie wysyłał zbędnych maili, nie logował niepotrzebnych informacji oraz podejmował działania tylko wtedy, gdy naprawdę coś się zmieni.

Najważniejszą częścią działania całego monitora jest odpowiednio zaprojektowana logika sprawdzania statusu stron i reagowania wyłącznie na to, co istotne. Cała istota polega na tym, że monitor zapamiętuje poprzedni stan każdej strony w pliku status.json. Dzięki temu, przy każdym kolejnym sprawdzeniu, może porównać poprzedni i aktualny status. I dopiero na tej podstawie podejmuje decyzję. 

```json
//status.json

{
    "https://gcs.gda.pl": "up", 
    "https://bip.gcs.gda.pl": "up", 
    "https://kulewicz.net": "up", 
    "http://192.168.50.20": "down"
}

```
Logika sprowadza się do trzech przypadków:

- **strona widziana pierwszy raz** - jeśli strona nie istnieje jeszcze w pliku status.json, program traktuje to jako pierwsze sprawdzenie. Jeżeli już na starcie jest „down”, od razu wysyła powiadomienie,

- **status uległ zmianie** - to najważniejszy element logiki. Program reaguje tylko wtedy, gdy status zmieni się z „up” na „down” albo odwrotnie. Dzięki temu uniknąłem spamowania maila i logów. Natomiast każda zmiana generuje komunikat, który trafia do logu oraz jest wysyłany mailem.

```bash
#logs/monitor.log

2025-12-02 19:19:21,468 INFO: Strona https://gcs.gda.pl nie działa.
2025-12-02 19:19:39,712 INFO: Strona http://kulewicz.net nie działa.
2025-12-02 19:20:02,772 INFO: Strona https://gcs.gda.pl już działa.
2025-12-02 19:25:03,235 INFO: Strona http://kulewicz.net już działa.

```

- **brak zmiany — brak akcji** - jeśli strona działała i nadal działa, albo była niedostępna i nadal jest niedostępna — program nie robi nic :)

## Konfiguracja 

Zastosowałem w programie prosty plik konfiguracyjny w formacie JSON. W pliku tym wskazujemy strony wskazane do monitorowania oraz dane do wysyłki e-mail. 

```json
//config.json
{
    "sites": [
        {
            "url": "https://gcs.gda.pl"
        },
        {
            "url": "https://bip.gcs.gda.pl"
        },
        {
            "url": "https://kulewicz.net"
        }
    ],
    "host": "mail32.mydevil.net",
    "port": 465,
    "username": "user@test.xyz",
    "password": "secretPassword34",
    "receiver": "receiver@test.xyz"
}

```

## Cały program

A oto cały kod programu:

```python

import requests
import time
import json
import os
import ssl
import smtplib
import logging
from email.message import EmailMessage

BASE_DIR = os.path.dirname(__file__)
STATUS_FILE = os.path.join(BASE_DIR, "status.json")
CONFIG_FILE = os.path.join(BASE_DIR, "config.json")
LOG_FILE = os.path.join(BASE_DIR, "logs/monitor.log")

logging.basicConfig(
    filename=LOG_FILE,
    level=logging.INFO,
    format="%(asctime)s %(levelname)s: %(message)s"
)

def send_email(message, config, url):
    """Wysyła powiadomienie e-mail o zmianie statusu strony.

    message — treść wiadomości
    config — dane konfiguracyjne SMTP (host, użytkownik, hasło itd.)
    url — adres strony, której dotyczy powiadomienie
    """
    host = config["host"]
    port = config["port"]
    username = config["username"]
    password = config["password"]
    receiver = config["receiver"]

    msg = EmailMessage()
    msg["From"] = username
    msg["To"] = receiver
    msg["Subject"] = f"Informacja dotycząca działania strony {url}"
    msg.set_content(message)

    context = ssl.create_default_context()
    with smtplib.SMTP_SSL(host, port, context=context) as server:
        server.login(username, password)
        server.send_message(msg)


def load_json(path):
    """Wczytuje dane z pliku JSON.
    Zwraca pusty słownik, jeśli plik nie istnieje (np. pierwszy start programu).
    """
    if not os.path.exists(path):
        return {}
    with open(path) as f:
        return json.load(f)


def save_state(path, data):
    """Zapisuje bieżący stan stron do pliku JSON."""
    with open(path, "w") as f:
        json.dump(data, f)


def get_site_status(url):
    """Sprawdza, czy witryna odpowiada kodem 200.
    Zwraca 'up' jeśli strona działa, inaczej 'down'.
    """
    try:
        response = requests.get(url, timeout=10)
        return "up" if response.status_code == 200 else "down"
    except Exception:
        return "down"


def clean_state(state, sites):
    """Usuwa ze stanu adresy stron, które zostały usunięte z config.json.
    Dzięki temu stan jest zawsze zgodny z bieżącą listą stron.
    """
    valid_urls = {site["url"] for site in sites}
    return {url: status for url, status in state.items() if url in valid_urls}


def create_status_message(url, old_status, new_status):
    """Tworzy komunikat opisujący zmianę statusu:
    - jeśli strona padła → 'Strona X nie działa.'
    - jeśli wróciła → 'Strona X już działa.'
    Jeśli zmian nie ma, zwraca None.
    """
    if old_status is None:
        if new_status == "down":
            return f"Strona {url} nie działa."
        return None

    if old_status != new_status:
        if new_status == "down":
            return f"Strona {url} nie działa."
        else:
            return f"Strona {url} już działa."

    return None  


def check_websites(config, state):
    sites = config["sites"]
    state = clean_state(state, sites)

    for site in sites:
        url = site["url"]
        previous_status = state.get(url)
        current_status = get_site_status(url)

        message = create_status_message(url, previous_status, current_status)

        if message:
            logging.info(message)
            send_email(message, config, url)

        state[url] = current_status

    save_state(STATUS_FILE, state)


if __name__ == "__main__":
    config = load_json(CONFIG_FILE)
    state = load_json(STATUS_FILE)
    check_websites(config, state)
    
```

## Wdrożenie i uruchomienie programu

Monitor stron uruchomiłem na VPS Mikrus, ale bez problemu można odpalić go na dowolnym serwerze, a nawet lokalnym komputerze. Ja umieściłe program w `/opt/uptime-watcher`.

Aby uruchomić program w tej lokalizacji:

Wchodzimy do odpowiedniego katalogu, pobieramy repozytorium z github:

```bash
cd /opt
sudo git clone https://github.com/akulewicz/uptime-watcher.git
```

Następnie wchodzi do katalogu z plikami, zmieniamy nazwę pliku konfiguracyjnego oraz nadajemy odpowiednie uprawnienia:

```bash
cd uptime-watcher
sudo mv config_example.json config.json
sudo chown -R $USER:$USER /opt/uptime-watcher/
chmod 700 /opt/uptime-watcher/
chmod 600 /opt/uptime-watcher/config.json 
```

W kolejny kroku edytujemy plik konfiguracyjny:

```bash
nano config.json
```

Po wpisaniu w pliku konfiguracyjnym domen do monitorowania oraz danych niezbędnych do wysyłki maili tworzymy środowisko wirtualne i instalujemy zależności:

```bash
python3 -m venv venv
pip install -r requirements.txt
source venv/bin/activate
```

Teraz przyszła kolej na uruchomienie programu w ustalonym interwale. Sposobów na to jest przynajmniej kilka. Ja skorzystałem z cron, ale pewnie przy bardziej skomplikowanym skrypcie i większej ilości stron skłaniałbym się ku systemd + timer.

Tym, którzy nie wiedzą wyjaśnię, że cron jest opartym na czasie programem do harmonogramowania zadań. Aby dodać uruchomienie programu do harmonogramu należy wpisać `crontab -e`, a następnie dopisać:

```bash
* * * * * /opt/uptime-watcher/venv/bin/python3 /opt/uptime-watcher/main.py
```
Pierwsze pięć pól (gwiazdki) służy określeniu czasu (minuty, godziny, dni, miesiące, dni tygodnia). W tym kokretnym przykładzie skrypt będzie uruchamiał się co minutę.

I gotowe. Można łatwo przetestować działanie programu dopisując do konfiguracji niesistniejący w naszej sieci adres, np. https://10.10.10.10. Oczywiście, jeśli ktoś chce rozwinąc aplikację, to może dopisać jakieś bardziej profesjonalne testy. Na moje potrzeby to wystarczy.

## Podsumowanie

Ten prosty program okazał się dokładnie tym, czego potrzebowałem. Jest prosty w konfiguracji i wdrożeniu, nie wymaga wielu zasobów i najważniejsze - robi robotę :)


