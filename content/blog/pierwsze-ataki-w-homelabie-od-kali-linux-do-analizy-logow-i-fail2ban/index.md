+++
title = 'Pierwsze ataki w homelabie: od Kali Linux do analizy logów i Fail2ban'
date = 2026-01-25T17:14:58+01:00
draft = false
avatar = "/images/avatar.webp"
description = "W ostatnim wpisie podałem przykład homelabu do nauki cyberbezpieczeństwa dla początkujących. Po skonfigurowaniu środowiska z maszynami wirtualnymi przechodzimy do praktyki. Na początek zrobimy coś prostego — przeprowadzimy atak na SSH z Kali Linux na jedną z maszyn w sieci, dokonamy analizy śladów w logach oraz wdrożymy Fail2ban jako jeden z możliwych sposobów obrony przed intruzami."
author = "Arkadiusz Kulewicz"
image = ""
categories = ["homelab"]
+++

W ostatnim wpisie podałem [przykład homelabu do nauki cyberbezpieczeństwa dla początkujących](https://kulewicz.net/blog/tworzymy-homelab-do-nauki-cyberbezpieczenstwa/). Po skonfigurowaniu środowiska z maszynami wirtualnymi przechodzimy do praktyki. Na początek zrobimy coś prostego — przeprowadzimy atak na SSH z Kali Linux na jedną z maszyn w sieci, dokonamy analizy śladów w logach oraz wdrożymy Fail2ban jako jeden z możliwych sposobów obrony przed intruzami.

## Przygotowanie środowiska

Do symulacji ataku potrzebujemy dwóch maszyn. Posłużę się środowiskiem opisanym w ostatnim poście dotyczącym utworzenia pierwszego homelabu. Wykorzystamy dwie maszyny wirtualne:

- **atakujący** — VM z Kali Linux (IP `192.168.1.108`)
- **ofiara** — VM z Ubuntu Server (IP `192.168.1.20`)

Na Ubuntu musi być uruchomiona usługa SSH. Jeśli nie jest zainstalowana, wykonaj polecenie:

```bash
sudo apt update && sudo apt install openssh-server
```

## Atak z Kali Linux

Kali Linux to dystrybucja systemu Linux oparta na Debianie, zaprojektowana głównie do testów penetracyjnych i audytów bezpieczeństwa. Wykorzystuje się ją do symulowania ataków, wyszukiwania luk w zabezpieczeniach, analizy ruchu sieciowego oraz testowania odporności systemów i aplikacji w kontrolowanym środowisku. W standardowej instalacji zawiera setki przydatnych narzędzi.

Do naszego ataku użyjemy jednego z nich — **Hydra**. Jest to narzędzie służące do automatyzowania ataków na loginy i hasła do różnych usług sieciowych, takich jak SSH.

Do przeprowadzenia ataku będzie nam potrzebna lista haseł. W katalogu domowym tworzymy plik `passwords.txt`, zawierający przykładowe hasła:

```text
password123
tajnehaslo23
Kasia23
Adam2026
jestemhackerem
1haslo2
adam_mickiewicz
hero1999
1q2w3e4
asdefghjkl
```

Jak już mamy gotową listę haseł, możemy przejść do ataku:

```bash
hydra -l root -P passwords.txt ssh://192.168.1.20 -t 4
```

Hydra próbuje zalogować się przez SSH na maszynę znajdująca się pod adresem `192.168.1.20` jako użytkownik `root`, używając kolejnych haseł z listy.

## Analiza logów na Ubuntu

Teraz przechodzimy na maszynę ofiary i szukamy śladów świadczących o próbie włamania. Próby połączenia przez OpenSSH są rejestrowane w dzienniku autoryzacji, znajdującym się w pliku `/var/log/auth.log`. I właśnie w tym miejscu należy szukać śladów nieudanego logowanie. W tym celu wydajemy polecenie:

```bash
sudo tail -n 50 /var/log/auth.log | grep "Failed password"
```

Logi zawierają datę, godzinę oraz adres IP źródła ataku. Oczywiście, jeśli w logach znajdują się 2-3 nieudane próby logowania, to może świadczyć o tym, że ktoś po prostu źle wpisał hasło. Ale jeśli tych prób jest więcej, to mamy temat, którym trzeba się zająć.


## Wdrażamy ochronę

Sposobów na prewencję i odcinanie tego typu ataków jest wiele. Można np.:

- zmienić port, na którym nasłuchuje SSH (domyślnie jest to port 22),
- wyłączyć możliwość nawiązywania połączenia SSH przez użytkownika root,
- wyłączyć możliwość uwierzytelniania się za pomocą haseł na rzecz kluczy,
- ustawić na firewallu możliwość łączenia się przez SSH z wybranych adresów IP,
- jeśli korzystasz z Wazuh możesz ustawić tzw. Active Response, które odetnie atakującego.

Ja natomiast skupię się na **Fail2ban**, stanowiącym dodatkową warstwę zabezpieczającą. 

Instalacja Fail2ban jest stosunkowo prosta. Najpierw należy zainstalować pakiet:

```bash
sudo apt install fail2ban
```
Konfiguracja Fail2ban polega na utworzeniu pliku konfiguracyjnego. W tym celu wydajemy polecenie:


```bash
sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local
```

W pliku `jail.local` znajdziemy kilka ustawień, które należy skonfigurować. Opcja `banetime` określa na jaki czas intruz zostanie zablokowany przez Fail2ban. Domyślnie jest to 10 min.

```ini
bantime = 10m
```

Ważnym ustawieniem jest opcja `maxretry`, która określa po ilu nieudanych próbach nastąpi reakcja ze strony Fail2ban:

```ini
maxretry = 5
```

Przydatnych ustawień jest więcej, dlatego gorąco zachęcam do zapoznania się z całym plikiem konfiguracyjnym. Na nasze dzisiejsze potrzeby te dwa ustawienia wystarczą.

Po dokonaniu zmian w plikach konfiguracyjnych należy zrestartować Fail2ban i sprawdzić jego status:

```bash
sudo systemctl restart fail2ban
sudo systemctl status -l fail2ban
```

## Testujemy ochronę

Przyszedł czas na weryfikację skuteczności Fail2ban. W tym celu wracamy na VM z Kali Linux i ponownie uruchamiamy Hydrę:

```bash
hydra -l root -P passwords.txt ssh://192.168.1.20 -t 4
```

Następnie próbujemy połączyć się przez SSH z maszyną ofiary:

```bash
ssh root@192.168.1.20
```

Odpowiedź będzie następująca:

```text
ssh: connect to host 192.168.1.20 port 22: Connection refused
```

Zostaliśmy zablokowani.

Teraz wracamy na maszynę ofiary i sprawdzamy, co się zadziało. Śladów znajdziemy kilka. 

W pierwszej kolejności sprawdzamy logi Fail2ban:

```bash
sudo grep "Ban" /var/log/fail2ban.log
```

Lista zbanowanych adresów:

```bash
sudo fail2ban-client banned
```

Przykładowy wynik:

```text
[{'sshd': ['192.168.1.108']}]
```

Możemy jeszcze zweryfikować, co się zadziało na firewallu:


```bash
sudo iptables -L
```

```text
Chain f2b-sshd (1 references)
target     prot opt source               destination
REJECT     all  --  192.168.1.108        anywhere             reject-with icmp-port-unreachable
RETURN     all  --  anywhere             anywhere
```

Na koniec sprawdźmy jeszcze, co się stanie po upływie czasu określonego w `banetime`. Po upływie 10 minut ponownie próbujemy połączyć się przez SSH z maszyną ofiary:

```bash
ssh root@192.168.1.20
```

Tym razem połączenie powinno zostać nawiązane bez żadnego problemu.

## Podsumowanie

Przeszliśmy dziś prosty, aczkolwiek pełny scenariusz: od symulacji ataku na SSH, przez analizę logów, aż po wdrożenie i przetestowanie Fail2ban. Zachęcam gorąco do robienia tego typu ćwiczeń w homelabie. Z nauką cyberecurity jest trochę, jak z wojskiem - nauka taktyki jest ważna, ale na nic się zda bez porządnego poligonu. Podobnie jest u nas - książki, tutoriale i podcasty są mega istotne, ale bez przećwiczenia tego w warunkach pligonowych (czyli naszym homelabie) czeka nas porażka :) 