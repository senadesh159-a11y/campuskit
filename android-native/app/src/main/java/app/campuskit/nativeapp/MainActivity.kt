package app.campuskit.nativeapp

import android.content.Context
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import org.json.JSONArray
import org.json.JSONObject

private val Ink = Color(0xFF101410)
private val Lime = Color(0xFFB7F34A)
private val Paper = Color(0xFFF5F7F1)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { CampusKitApp(this) }
    }
}

private data class Entry(val title: String, val detail: String, val done: Boolean = false)

@Composable
private fun CampusKitApp(context: Context) {
    val prefs = remember { context.getSharedPreferences("campuskit_native", Context.MODE_PRIVATE) }
    var page by remember { mutableStateOf("Home") }
    var selectedLab by remember { mutableStateOf<String?>(null) }
    val assignments = remember { mutableStateListOf<Entry>().apply { addAll(readEntries(prefs, "assignments")) } }
    val timetable = remember { mutableStateListOf<Entry>().apply { addAll(readEntries(prefs, "timetable")) } }
    val notes = remember { mutableStateListOf<Entry>().apply { addAll(readEntries(prefs, "notes")) } }
    fun persist(key: String, list: List<Entry>) = prefs.edit().putString(key, JSONArray().apply {
        list.forEach { put(JSONObject().put("title", it.title).put("detail", it.detail).put("done", it.done)) }
    }.toString()).apply()

    MaterialTheme(colorScheme = lightColorScheme(primary = Ink, secondary = Lime, background = Paper, surface = Color.White)) {
        Scaffold(
            containerColor = Paper,
            topBar = {
                Surface(color = Ink) {
                    Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("Campus", color = Color.White, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleLarge)
                        Text("Kit", color = Lime, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleLarge)
                        Spacer(Modifier.weight(1f))
                        Text("STUDENT SPACE", color = Color.LightGray, style = MaterialTheme.typography.labelSmall)
                    }
                }
            },
            bottomBar = {
                NavigationBar(containerColor = Color.White) {
                    listOf("Home", "Tasks", "Classes", "Notes", "More").forEach { item ->
                        NavigationBarItem(selected = page == item, onClick = { page = item; selectedLab = null },
                            icon = { Text(when(item) { "Home" -> "⌂"; "Tasks" -> "✓"; "Classes" -> "▦"; "Notes" -> "▤"; else -> "•••" }) },
                            label = { Text(item) })
                    }
                }
            }
        ) { padding ->
            Column(Modifier.fillMaxSize().padding(padding).padding(16.dp)) {
                if (selectedLab != null) {
                    LabDetail(selectedLab!!) { selectedLab = null }
                } else when (page) {
                    "Home" -> HomeScreen(assignments.size, assignments.count { it.done }, timetable.size, notes.size,
                        onNavigate = { page = it })
                    "Tasks" -> EntryScreen("Assignment Tracker", "Assignment title", "Subject / due date", assignments,
                        onAdd = { a, b -> assignments.add(Entry(a,b)); persist("assignments", assignments) },
                        onDelete = { assignments.removeAt(it); persist("assignments", assignments) },
                        onToggle = { i -> assignments[i] = assignments[i].copy(done = !assignments[i].done); persist("assignments", assignments) })
                    "Classes" -> EntryScreen("Class Timetable", "Class / subject", "Day and time", timetable,
                        onAdd = { a, b -> timetable.add(Entry(a,b)); persist("timetable", timetable) },
                        onDelete = { timetable.removeAt(it); persist("timetable", timetable) })
                    "Notes" -> EntryScreen("Notes Library", "Note title", "Short note / subject", notes,
                        onAdd = { a, b -> notes.add(Entry(a,b)); persist("notes", notes) },
                        onDelete = { notes.removeAt(it); persist("notes", notes) })
                    "Focus" -> FocusScreen()
                    "Laboratory" -> LabScreen { selectedLab = it }
                    else -> MoreScreen(onFocus = { page = "Focus" }, onLab = { page = "Laboratory" })
                }
            }
        }
    }
}

private fun readEntries(context: android.content.SharedPreferences, key: String): List<Entry> {
    return try {
        val arr = JSONArray(context.getString(key, "[]"))
        (0 until arr.length()).map { i ->
            val o = arr.getJSONObject(i); Entry(o.optString("title"), o.optString("detail"), o.optBoolean("done"))
        }
    } catch (_: Exception) { emptyList() }
}

@Composable
private fun HomeScreen(tasks: Int, done: Int, classes: Int, notes: Int, onNavigate: (String) -> Unit) {
    LazyColumn(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item {
            Text("Welcome back, Student.", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold, color = Ink)
            Text("Your study space, organised.", color = Color.DarkGray)
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                StatCard("Assignments", "$done / $tasks", Modifier.weight(1f))
                StatCard("Classes", "$classes", Modifier.weight(1f))
                StatCard("Notes", "$notes", Modifier.weight(1f))
            }
        }
        item { Text("Your workspace", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold) }
        item { ActionCard("Assignment Tracker", "Add, complete and manage tasks", "Tasks") { onNavigate("Tasks") } }
        item { ActionCard("Class Timetable", "Keep your weekly classes organised", "Classes") { onNavigate("Classes") } }
        item { ActionCard("Notes Library", "Save and revisit study notes", "Notes") { onNavigate("Notes") } }
        item { ActionCard("Focus Mode", "Start a distraction-free session", "More") { onNavigate("More") } }
    }
}

@Composable
private fun StatCard(label: String, value: String, modifier: Modifier = Modifier) {
    Card(modifier, colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(18.dp)) {
        Column(Modifier.padding(12.dp)) {
            Text(value, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, color = Ink)
            Text(label, style = MaterialTheme.typography.labelSmall, color = Color.DarkGray)
        }
    }
}

@Composable
private fun ActionCard(title: String, subtitle: String, tag: String, onClick: () -> Unit) {
    Card(onClick = onClick, modifier = Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = Color.White),
        shape = RoundedCornerShape(18.dp)) {
        Row(Modifier.padding(18.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(title, fontWeight = FontWeight.Bold, color = Ink)
                Text(subtitle, color = Color.DarkGray, style = MaterialTheme.typography.bodySmall)
            }
            Text("OPEN  →", color = Ink, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun EntryScreen(title: String, firstHint: String, secondHint: String, entries: List<Entry>,
                        onAdd: (String,String) -> Unit, onDelete: (Int) -> Unit, onToggle: ((Int) -> Unit)? = null) {
    var first by remember { mutableStateOf("") }
    var second by remember { mutableStateOf("") }
    Column(Modifier.fillMaxSize()) {
        Text(title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(first, { first = it }, Modifier.fillMaxWidth(), label = { Text(firstHint) }, singleLine = true)
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(second, { second = it }, Modifier.fillMaxWidth(), label = { Text(secondHint) }, minLines = 2)
        Button(onClick = { if (first.isNotBlank()) { onAdd(first.trim(), second.trim()); first = ""; second = "" } },
            enabled = first.isNotBlank(), colors = ButtonDefaults.buttonColors(containerColor = Ink)) {
            Text("＋ Add", color = Color.White)
        }
        HorizontalDivider(Modifier.padding(vertical = 12.dp))
        if (entries.isEmpty()) Text("Nothing here yet. Add your first item.", color = Color.Gray)
        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            itemsIndexed(entries) { index, entry ->
                Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(14.dp)) {
                    Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        if (onToggle != null) Checkbox(entry.done, { onToggle(index) })
                        Column(Modifier.weight(1f)) {
                            Text(entry.title, fontWeight = FontWeight.SemiBold)
                            if (entry.detail.isNotBlank()) Text(entry.detail, color = Color.DarkGray, style = MaterialTheme.typography.bodySmall)
                            if (entry.done) Text("COMPLETED", color = Color(0xFF548000), style = MaterialTheme.typography.labelSmall)
                        }
                        TextButton(onClick = { onDelete(index) }) { Text("Delete", color = Color(0xFFB3261E)) }
                    }
                }
            }
        }
    }
}

@Composable
private fun MoreScreen(onFocus: () -> Unit, onLab: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("More tools", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        ActionCard("Focus Mode", "Pomodoro-style study timer", "FOCUS", onFocus)
        ActionCard("Virtual Laboratory", "Explore interactive practicals", "LAB", onLab)
        Text("More CampusKit features are being migrated into native Android screens.", color = Color.DarkGray)
    }
}

@Composable
private fun FocusScreen() {
    var minutes by remember { mutableIntStateOf(25) }
    var secondsLeft by remember { mutableIntStateOf(25 * 60) }
    var running by remember { mutableStateOf(false) }
    LaunchedEffect(running) {
        while (running && secondsLeft > 0) { delay(1000); secondsLeft-- }
        if (secondsLeft == 0) running = false
    }
    Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        Text("FOCUS MODE", style = MaterialTheme.typography.labelLarge, color = Color.DarkGray)
        Text(String.format("%02d:%02d", secondsLeft / 60, secondsLeft % 60), style = MaterialTheme.typography.displayLarge, fontWeight = FontWeight.Bold)
        Text("One task. One session. Full attention.", color = Color.DarkGray)
        Spacer(Modifier.height(20.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            OutlinedButton(onClick = { if (!running && minutes > 1) { minutes--; secondsLeft = minutes * 60 } }) { Text("−") }
            Text("$minutes min", Modifier.padding(horizontal = 18.dp), fontWeight = FontWeight.Bold)
            OutlinedButton(onClick = { if (!running && minutes < 240) { minutes++; secondsLeft = minutes * 60 } }) { Text("+") }
        }
        Spacer(Modifier.height(12.dp))
        Button(onClick = { running = !running }, colors = ButtonDefaults.buttonColors(containerColor = Ink)) {
            Text(if (running) "Pause" else "Start focus", color = Color.White)
        }
        TextButton(onClick = { running = false; secondsLeft = minutes * 60 }) { Text("Reset") }
    }
}

@Composable
private fun LabScreen(onSelect: (String) -> Unit) {
    val labs = listOf("Simple Pendulum" to "Physics", "Vernier Calipers" to "Physics",
        "Prism Deviation" to "Physics", "Electromagnetic Induction" to "Physics",
        "Acid–Base Titration" to "Chemistry", "Redox Titration (KMnO₄)" to "Chemistry",
        "Ostwald Viscometer" to "Chemistry", "3D Cell Structure" to "Biology",
        "Human Heart Circulation" to "Biology", "3D Vector Operations" to "Mathematics",
        "Human Evolution" to "Anthropology")
    Column {
        Text("Virtual Laboratory", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        Text("Native experiment catalogue • Choose a practical")
        Spacer(Modifier.height(10.dp))
        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            itemsIndexed(labs) { _, item -> ActionCard(item.first, item.second, "OPEN") { onSelect(item.first) } }
        }
    }
}

@Composable
private fun LabDetail(name: String, onBack: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        TextButton(onClick = onBack) { Text("← Laboratory") }
        Text(name, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        Text("Practical workspace", color = Color.DarkGray)
        Text("This native experiment module is being built. The original CampusKit website experiment remains available separately while its controls, models and observation tools are migrated.")
        Card(colors = CardDefaults.cardColors(containerColor = Color.White)) {
            Column(Modifier.padding(16.dp)) {
                Text("Experiment sections", fontWeight = FontWeight.Bold)
                Text("• Aim and apparatus")
                Text("• Theory and procedure")
                Text("• Interactive variables and observations")
                Text("• Result and viva preparation")
            }
        }
    }
}
